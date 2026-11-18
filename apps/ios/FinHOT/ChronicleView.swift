import SwiftUI
import Charts
import FinHOTCore

struct ChroniclePage: Decodable, Identifiable {
    var id: String { "\(group)/\(slug)" }
    let group: String
    let slug: String
    let cardTitle: String
    let cardBlurb: String
    let chartNote: String
}
struct ChronicleView: View {
    private var pages: [ChroniclePage] {
        guard let url = Bundle.main.url(forResource: "chronicle", withExtension: "json"), let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([ChroniclePage].self, from: data)) ?? []
    }
    var body: some View {
        List {
            Section {
                Text("把新闻放回市场背景").font(.title3.bold())
                Text("原生图表展示宽基、回撤与行业历史。实际来源、日期和覆盖范围见每张图。复杂专题与美股图表将在后续版本迁移。").font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(["broad", "sectors"], id: \.self) { group in
                Section(group == "broad" ? "宽基与周期" : "行业与轮动") {
                    ForEach(pages.filter { $0.group == group }) { page in
                        NavigationLink { ChronicleChartView(page: page) } label: {
                            VStack(alignment: .leading, spacing: 8) { Text(page.cardTitle).font(.headline); Text(page.cardBlurb).font(.subheadline).foregroundStyle(.secondary) }.padding(.vertical, 6)
                        }
                    }
                }
            }
        }.navigationTitle("编年史")
    }
}
struct ChronicleChartView: View {
    let page: ChroniclePage
    @EnvironmentObject private var app: AppState
    @State private var count = 250
    var body: some View {
        RemoteView(load: { () async throws -> ChronicleSeries in try await app.client!.resource("api/chronicle/\(page.group)/\(page.slug).json") }) { payload in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(page.cardTitle).font(.largeTitle.bold())
                    Text(page.chartNote).foregroundStyle(.secondary)
                    if payload.dates.isEmpty {
                        ContentUnavailableView("暂无可用数据", systemImage: "chart.xyaxis.line", description: Text("网站尚未同步这组数据。"))
                    } else {
                        Picker("展示范围", selection: $count) { Text("近 250 点").tag(250); Text("近 750 点").tag(750); Text("全部").tag(Int.max) }.pickerStyle(.segmented)
                        ChroniclePlot(payload: payload, count: count)
                    }
                    Divider()
                    if let start = payload.dates.first, let end = payload.dates.last {
                        Text("数据覆盖：\(start) — \(end)").font(.footnote)
                        if payload.meta.status == "stale" {
                            Label("数据延迟 · 最新观测 \(end)", systemImage: "clock").foregroundStyle(.orange)
                        }
                    }
                    Text("来源：\(payload.meta.source ?? "网站未标注")").font(.footnote)
                    if let updated = payload.meta.updatedAt { Text("数据更新时间：\(updated)").font(.footnote) }
                    Text("仅供历史研究，不构成投资建议。").font(.footnote).foregroundStyle(.secondary)
                }.padding(22)
            }
        }.navigationBarTitleDisplayMode(.inline)
    }
}

private struct ChroniclePlot: View {
    let payload: ChronicleSeries
    let count: Int

    var body: some View {
        let indices = payload.dates.indices.suffix(count)
        if let first = indices.first, let last = indices.last {
            Chart {
                ForEach(payload.lines) { line in
                    ForEach(runs(line, in: indices), id: \.lowerBound) { run in
                        ForEach(run, id: \.self) { index in
                            if let value = line.values[index] {
                                if payload.meta.type == "bar" {
                                    BarMark(x: .value("日期", index), y: .value("数值", value))
                                } else {
                                    LineMark(x: .value("日期", index), y: .value("数值", value),
                                             series: .value("线段", "\(line.name)-\(run.lowerBound)"))
                                        .foregroundStyle(by: .value("指标", line.name))
                                }
                            }
                        }
                    }
                }
            }
            .chartLegend(payload.lines.count > 1 ? .visible : .hidden)
            .chartXAxis {
                AxisMarks(values: first == last ? [first] : [first, last]) { axis in
                    if let i = axis.as(Int.self), payload.dates.indices.contains(i) {
                        AxisValueLabel { Text(payload.dates[i]) }
                    }
                }
            }
            .frame(height: 300)
            Text("\(payload.dates[first]) — \(payload.dates[last]) · \(indices.count) 个观测期").font(.caption)
            ForEach(payload.lines) { line in
                if let value = line.values[last] {
                    Text("\(payload.lines.count > 1 ? line.name : "最新值") \(value.formatted(.number.precision(.fractionLength(2))))")
                        .font(.headline.monospacedDigit())
                }
            }
        }
    }

    private func runs(_ line: ChronicleSeries.Line, in range: Range<Int>) -> [Range<Int>] {
        range.split(whereSeparator: { line.values[$0] == nil }).map { $0.startIndex..<$0.endIndex }
    }
}
