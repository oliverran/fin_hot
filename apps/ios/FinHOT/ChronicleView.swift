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
                    if payload.series.isEmpty {
                        ContentUnavailableView("暂无可用数据", systemImage: "chart.xyaxis.line", description: Text("网站尚未同步这组数据。"))
                    } else {
                        Picker("展示范围", selection: $count) { Text("近 250 点").tag(250); Text("近 750 点").tag(750); Text("全部").tag(Int.max) }.pickerStyle(.segmented)
                        let points = Array(payload.series.suffix(min(count, payload.series.count)))
                        Chart(points) { point in
                            if payload.meta.type == "bar" { BarMark(x: .value("日期", point.date), y: .value("数值", point.value)) }
                            else { LineMark(x: .value("日期", point.date), y: .value("数值", point.value)) }
                        }
                        .chartXAxis { AxisMarks(values: [points.first?.date, points.last?.date].compactMap { $0 }) }
                        .frame(height: 300)
                        if let first = points.first, let last = points.last {
                            Text("\(first.date) — \(last.date) · \(points.count) 个数据点").font(.caption).foregroundStyle(.secondary)
                            Text("最新值 \(last.value.formatted(.number.precision(.fractionLength(2))))").font(.title2.monospacedDigit())
                        }
                    }
                    Divider()
                    Text("来源：\(payload.meta.source ?? "网站未标注")").font(.footnote)
                    if let updated = payload.meta.updatedAt { Text("更新：\(updated)").font(.footnote) }
                    Text("仅供历史研究，不构成投资建议。").font(.footnote).foregroundStyle(.secondary)
                }.padding(22)
            }
        }.navigationBarTitleDisplayMode(.inline)
    }
}
