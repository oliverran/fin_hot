import SwiftUI
import FinHOTCore

struct ReportsView: View {
    @EnvironmentObject private var app: AppState
    @State private var kind: ReportKind = .daily
    var body: some View {
        VStack {
            Picker("简报周期", selection: $kind) { ForEach(ReportKind.allCases, id: \.self) { Text($0.label).tag($0) } }.pickerStyle(.segmented).padding(.horizontal)
            RemoteView(load: { () async throws -> ReportIndex in try await app.client!.reportIndex(kind: kind) }) { index in
                List {
                    ForEach(index.items) { issue in
                        NavigationLink { ReportView(kind: kind, key: issue.key) } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(issue.key).font(.caption).foregroundStyle(.tint)
                                Text(issue.title ?? "金融\(kind.label)").font(.headline)
                            }.padding(.vertical, 12)
                        }
                    }
                    if index.items.isEmpty { ContentUnavailableView("还没有发布\(kind.label)", systemImage: "doc.text") }
                }.listStyle(.plain)
            }.id(kind)
        }.navigationTitle("金融简报")
    }
}
struct ReportView: View {
    let kind: ReportKind
    let key: String
    @EnvironmentObject private var app: AppState
    var body: some View {
        RemoteView(load: { () async throws -> ReportDetail in try await app.client!.report(kind: kind, key: key) }) { report in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("FINHOT / \(kind.label)").font(.caption.bold()).tracking(3).foregroundStyle(.tint)
                    Text(report.title).font(.largeTitle.bold())
                    Text(report.key).font(.caption).foregroundStyle(.secondary)
                    Divider()
                    if let lead = report.lead { Text(lead.title).font(.title2.bold()); MarkdownText(text: lead.leadParagraph) }
                    if let overview = report.overview { MarkdownText(text: overview) }
                    ForEach(Array(report.sections.enumerated()), id: \.offset) { _, section in
                        Text(section.label).font(.title2.bold())
                        if let summary = section.summary { MarkdownText(text: summary) }
                        citations(section.items)
                    }
                    if !report.flashes.isEmpty { Text("快讯").font(.title2.bold()); citations(report.flashes) }
                }.padding(22)
            }
        }.navigationTitle(kind.label).navigationBarTitleDisplayMode(.inline)
            .toolbar { ShareLink(item: app.client!.site.page("\(kind.webPath)/\(key)")) }
    }
    @ViewBuilder private func citations(_ items: [ReportDetail.Citation]) -> some View {
        ForEach(Array(items.enumerated()), id: \.offset) { _, item in
            VStack(alignment: .leading, spacing: 8) {
                if !item.available { Text("该报道已不可用").foregroundStyle(.secondary) }
                else {
                    if let id = item.itemId { NavigationLink(item.title) { ArticleView(id: id) }.font(.headline) }
                    else if let raw = item.sourceURL, let url = URL(string: raw), ["http", "https"].contains(url.scheme ?? "") { Link(item.title, destination: url).font(.headline) }
                    else { Text(item.title).font(.headline) }
                    if let summary = item.summary { MarkdownText(text: summary) }
                    Text(item.sourceName).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}
