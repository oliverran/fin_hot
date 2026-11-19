import Accessibility
import SwiftUI
import FinHOTCore

struct ChronicleFigure: View {
    let page: ChroniclePage
    @EnvironmentObject private var app: AppState
    @State private var count: Int
    init(page: ChroniclePage, fullHistory: Bool) {
        self.page = page
        _count = State(initialValue: fullHistory ? Int.max : 250)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(page.cardTitle).font(.headline)
            Text(page.chartNote).font(.subheadline).foregroundStyle(.secondary)
            RemoteView(load: { try await app.client!.chart(group: page.group, slug: page.slug, title: page.cardTitle) }) { series in
                VStack(alignment: .leading, spacing: 10) {
                    if series.dates.count > 250 {
                        Picker("展示范围", selection: $count) {
                            Text("近 250 点").tag(250)
                            if series.dates.count > 750 { Text("近 750 点").tag(750) }
                            Text("全部").tag(Int.max)
                        }.pickerStyle(.segmented)
                    }
                    if !series.dates.isEmpty {
                        ChroniclePlot(series: series, count: count)
                        Text("数据覆盖：\(series.dates.first!) — \(series.dates.last!)").font(.caption)
                        if series.meta.status == "stale" { Label("数据延迟", systemImage: "clock").foregroundStyle(.orange) }
                    } else { Text("暂无可用数据，网站尚未同步这组数据。") }
                    if page.group == "us" {
                        Link(series.meta.source ?? "History of Market（数据来源）", destination: URL(string: "https://historyofmarket.com/")!)
                    } else { Text("来源：\(series.meta.source ?? "网站未标注")") }
                    if let updated = series.meta.updatedAt { Text("数据更新时间：\(updated)") }
                    Text("仅供历史研究，不构成投资建议。").foregroundStyle(.secondary)
                }.font(.footnote)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct PlotData: Sendable {
    struct Point: Sendable { let index: Int; let value: Double }
    struct Line: Sendable { let name: String; let runs: [[Point]]; let latest: Double? }
    let indices: Range<Int>
    let low, high: Double?
    let lines: [Line]
    init(_ series: ChronicleSeries, count: Int) {
        let visible = series.dates.indices.suffix(count)
        indices = visible
        // At most one bucket per horizontal screen point. Preserve endpoints, peaks,
        // troughs and gaps; all statistics and last values still use original samples.
        let bucketSize = series.meta.type == "bar" ? 1 : max(1, (visible.count + 479) / 480)
        var minimum: Double?
        var maximum: Double?
        lines = series.lines.map { line in
            var runs: [[Point]] = []
            var run: [Point] = []
            var start: Point?, bottom: Point?, top: Point?, end: Point?
            func flushBucket() {
                guard let start, let bottom, let top, let end else { return }
                for point in [start, bottom, top, end].sorted(by: { $0.index < $1.index }) where run.last?.index != point.index {
                    run.append(point)
                }
            }
            for index in visible {
                guard let value = line.values[index] else {
                    flushBucket()
                    if !run.isEmpty { runs.append(run); run = [] }
                    start = nil
                    continue
                }
                minimum = min(minimum ?? value, value)
                maximum = max(maximum ?? value, value)
                let point = Point(index: index, value: value)
                if start == nil || (index - visible.lowerBound).isMultiple(of: bucketSize) {
                    flushBucket()
                    start = point; bottom = point; top = point
                }
                if let b = bottom, value < b.value { bottom = point }
                if let t = top, value > t.value { top = point }
                end = point
            }
            flushBucket()
            if !run.isEmpty { runs.append(run) }
            return Line(name: line.name, runs: runs, latest: visible.last.flatMap { line.values[$0] })
        }
        low = minimum; high = maximum
    }
}

private struct ChroniclePlot: View {
    let series: ChronicleSeries
    let count: Int
    @State private var data: PlotData?
    private let colors: [Color] = [.accentColor, .orange, .blue]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let data, let minValue = data.low, let maxValue = data.high,
               let first = data.indices.first, let last = data.indices.last {
                let bars = series.meta.type == "bar"
                let low = bars ? min(0, minValue) : minValue
                let high = bars ? max(0, maxValue) : maxValue
                Canvas { context, size in
                    func y(_ v: Double) -> CGFloat { size.height * (high == low ? 0.5 : (high - v) / (high - low)) }
                    if bars && low < 0 && high > 0 {
                        var baseline = Path()
                        baseline.move(to: CGPoint(x: 0, y: y(0)))
                        baseline.addLine(to: CGPoint(x: size.width, y: y(0)))
                        context.stroke(baseline, with: .color(.secondary.opacity(0.5)), lineWidth: 1)
                    }
                    for (j, line) in data.lines.enumerated() {
                        let path = CGMutablePath()
                        for run in line.runs {
                            for (offset, sample) in run.enumerated() {
                                let x = bars ? size.width * (CGFloat(sample.index - first) + 0.5) / CGFloat(data.indices.count)
                                             : size.width * CGFloat(sample.index - first) / CGFloat(max(1, last - first))
                                let point = CGPoint(x: x, y: y(sample.value))
                                if bars { path.move(to: CGPoint(x: x, y: y(0))); path.addLine(to: point) }
                                else if offset > 0 { path.addLine(to: point) }
                                else {
                                    path.move(to: point)
                                    if run.count == 1 { context.fill(Path(ellipseIn: CGRect(x: x-1, y: point.y-1, width: 2, height: 2)), with: .color(colors[j % colors.count])) }
                                }
                            }
                        }
                        context.stroke(Path(path), with: .color(colors[j % colors.count]), lineWidth: bars ? min(12, size.width / CGFloat(data.indices.count) * 0.84) : 1.5)
                    }
                }.frame(height: 210).accessibilityLabel(series.meta.name)
                    .accessibilityChartDescriptor(PlotDescription(series: series, data: data, low: low, high: high))
                Text("\(series.dates[first]) — \(series.dates[last]) · \(data.indices.count) 个观测期").font(.caption)
                ForEach(Array(data.lines.enumerated()), id: \.offset) { index, line in
                    Text("\(data.lines.count == 1 ? "最新值" : line.name) \(line.latest?.formatted(.number.precision(.fractionLength(2))) ?? "暂无观测")")
                        .font(.headline.monospacedDigit()).foregroundStyle(colors[index % colors.count])
                }
                Text("区间数值 \(minValue.formatted()) — \(maxValue.formatted())").font(.caption)
            } else if data != nil { Text("此区间暂无可用观测值。") }
            else { ProgressView().frame(height: 210) }
        }
        .task(id: count) {
            let result = await Self.prepare(series, count: count)
            if !Task.isCancelled { data = result }
        }
    }

    nonisolated private static func prepare(_ series: ChronicleSeries, count: Int) async -> PlotData {
        PlotData(series, count: count)
    }
}

private struct PlotDescription: AXChartDescriptorRepresentable {
    let series: ChronicleSeries
    let data: PlotData
    let low, high: Double
    func makeChartDescriptor() -> AXChartDescriptor {
        let dates = series.dates
        let start = data.indices.lowerBound, end = data.indices.upperBound - 1
        let x = AXNumericDataAxisDescriptor(title: "日期", range: Double(start)...Double(max(start + 1, end)),
                                            gridlinePositions: []) { value in dates[min(end, max(start, Int(value)))] }
        let y = AXNumericDataAxisDescriptor(title: "数值", range: low...(high == low ? high + 1 : high),
                                            gridlinePositions: []) { $0.formatted() }
        let lines = data.lines.flatMap { line in
            line.runs.map { run in
                AXDataSeriesDescriptor(name: line.name, isContinuous: series.meta.type != "bar", dataPoints:
                    run.map { AXDataPoint(x: Double($0.index), y: $0.value, label: dates[$0.index]) })
            }
        }
        return AXChartDescriptor(title: series.meta.name, xAxis: x, yAxis: y, series: lines)
    }
}
