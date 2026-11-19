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
        }.navigationTitle("金融简报").readingMetrics("/daily")
    }
}
struct ReportView: View {
    let kind: ReportKind
    let key: String
    @EnvironmentObject private var app: AppState
    @AppStorage("readerTextSize") private var size = 0
    @State private var article: ReadingRoute?
    @State private var returnAnchor: String?
    var body: some View {
        RemoteView(load: { try await app.client!.report(kind: kind, key: key) }) { report in
            let sections = report.sections.filter { !$0.items.isEmpty || $0.summary?.isEmpty == false }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("\(report.key) · 金融\(kind.label)").font(.caption.bold()).foregroundStyle(.tint)
                        Text(report.title).font(.title.bold())
                        if let lead = report.lead?.leadParagraph, !lead.isEmpty { MarkdownText(text: lead) }
                        if let overview = report.overview, !overview.isEmpty, overview != report.lead?.leadParagraph { MarkdownText(text: overview) }
                        if !sections.isEmpty || !report.flashes.isEmpty {
                            Divider()
                            Text("本期版面").font(.headline)
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 105), alignment: .leading)], alignment: .leading) {
                                ForEach(Array(sections.enumerated()), id: \.offset) { i, section in
                                    Button(section.label) { proxy.scrollTo("section\(i)", anchor: .top) }
                                }
                                if !report.flashes.isEmpty { Button("快讯") { proxy.scrollTo("flashes", anchor: .top) } }
                            }.buttonStyle(.bordered).font(.subheadline)
                        }
                        ForEach(Array(sections.enumerated()), id: \.offset) { i, section in
                            heading(section.label).id("section\(i)")
                            if let text = section.summary, !text.isEmpty { MarkdownText(text: text) }
                            citations(section.items, prefix: "s\(i)", lead: report.lead)
                        }
                        if !report.flashes.isEmpty {
                            heading("快讯").id("flashes")
                            citations(report.flashes, prefix: "flash", lead: report.lead)
                        }
                    }.font(size == 2 ? .title2 : size == 1 ? .title3 : .body).padding(20)
                }
                .task {
                    guard let returnAnchor else { return }
                    await Task.yield()
                    proxy.scrollTo(returnAnchor, anchor: .top)
                }
                .onChange(of: article) { _, new in
                    if new == nil, let returnAnchor { proxy.scrollTo(returnAnchor, anchor: .top) }
                }
            }
        }
        .readingMetrics("/" + kind.webPath + "/issue", entry: "阅读" + kind.label).navigationTitle(kind.label).navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $article) { ArticleView(id: $0.id) }
        .toolbar { ShareLink(item: app.client!.site.page("\(kind.webPath)/\(key)")) }
    }
    private func heading(_ title: String) -> some View {
        Text(title).font(.title2.bold()).foregroundStyle(.tint).padding(.top, 10).accessibilityAddTraits(.isHeader)
    }
    private func citations(_ items: [ReportDetail.Citation], prefix: String, lead: ReportDetail.Lead?) -> some View {
        ForEach(Array(items.enumerated()), id: \.offset) { i, item in
            let anchor = "\(prefix)-\(i)"
            VStack(alignment: .leading, spacing: 10) {
                if !item.available { Text("该报道已不可用").foregroundStyle(.secondary) }
                else {
                    if let id = item.itemId {
                        Button { returnAnchor = anchor; article = ReadingRoute(id: id) } label: {
                            HStack { Text(item.title).multilineTextAlignment(.leading); Spacer(); Image(systemName: "chevron.right").font(.caption) }
                        }.buttonStyle(.plain).font(.headline)
                    } else if let raw = item.sourceURL, let url = URL(string: raw), ["http", "https"].contains(url.scheme ?? "") {
                        Link(item.title, destination: url).font(.headline)
                    } else { Text(item.title).font(.headline) }
                    if let text = item.summary, !text.isEmpty, !(item.title == lead?.title && text == lead?.leadParagraph) {
                        MarkdownText(text: text)
                    }
                    Text(item.sourceName).font(.caption).foregroundStyle(.secondary)
                }
                Divider()
            }.id(anchor)
        }
    }
}
