import SwiftUI
import FinHOTCore

private enum LibraryPage: Hashable { case history, bookmarks }

struct MoreView: View {
    @EnvironmentObject private var app: AppState
    @State private var address = ""
    @State private var error: String?
    var body: some View {
        List {
            Section {
                Text("FinHOT").font(.largeTitle.bold())
                Text("把分散的金融资讯，整理成可追溯的事件与每日简报。").foregroundStyle(.secondary)
            }
            if let id = app.reading.readIDs.first {
                Section("继续阅读") { BookmarkRow(id: id) }
            }
            Section {
                NavigationLink(value: LibraryPage.history) { Label("阅读记录", systemImage: "clock") }
                NavigationLink(value: LibraryPage.bookmarks) { Label("我的收藏", systemImage: "bookmark") }
                NavigationLink { TopicsView() } label: { Label("金融主题", systemImage: "square.grid.2x2") }
                NavigationLink { PolicyView(name: "使用规则", file: "terms") } label: { Label("使用规则", systemImage: "doc.plaintext") }
                NavigationLink { PolicyView(name: "隐私说明", file: "privacy") } label: { Label("隐私说明", systemImage: "hand.raised") }
            }
            Section("阅读说明") {
                Text("资讯与 AI 摘要仅供阅读和研究，重要信息请核对来源原文。行情以标注的数据日期和覆盖范围为准，不构成投资建议。")
                Text("收藏、已读记录和阅读位置仅保存在本机，不会自动与网站或其他设备同步。")
            }.font(.footnote).foregroundStyle(.secondary)
            #if DEBUG
            Section("开发连接") {
                TextField("https://网站域名", text: $address).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                Button("切换网站") { do { try app.connect(address) } catch { self.error = error.localizedDescription } }
                if let error { Text(error).foregroundStyle(.red) }
            }.onAppear { address = app.siteText }
            #endif
        }.navigationTitle("我的").readingMetrics("/more")
            .navigationDestination(for: LibraryPage.self) { page in
                switch page {
                case .history: ReadingHistoryView()
                case .bookmarks: BookmarksView()
                }
            }
            .navigationDestination(for: ReadingRoute.self) { ArticleView(id: $0.id) }
    }
}
struct BookmarksView: View {
    @EnvironmentObject private var app: AppState
    var body: some View {
        List {
            if app.bookmarks.ids.isEmpty { ContentUnavailableView("还没有收藏", systemImage: "bookmark", description: Text("在资讯列表左滑，或在文章右上角收藏。")) }
            ForEach(app.bookmarks.ids, id: \.self) { id in
                BookmarkRow(id: id).swipeActions { Button("移除", role: .destructive) { app.toggle(id) } }
            }
        }.navigationTitle("我的收藏").readingMetrics("/starred", entry: "我的收藏")
    }
}
struct BookmarkRow: View {
    let id: String
    @EnvironmentObject private var app: AppState
    var body: some View {
        RemoteView(load: { () async throws -> ArticleDetail in try await app.client!.siteGet("items/\(id)") }) { item in
            NavigationLink(value: ReadingRoute(id: id)) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(item.title).font(.headline)
                    HStack {
                        Text(item.source.name)
                        Spacer()
                        Text(app.reading.isRead(id) ? "已读" : "未读")
                    }.font(.caption).foregroundStyle(.secondary)
                }
            }
        }.id(id)
    }
}
struct TopicDirectory: Decodable, Sendable {
    struct Topic: Decodable, Identifiable, Sendable {
        var id: String { slug }
        let slug: String; let name: String; let definition: String; let total: Int
    }
    let topics: [Topic]
}
struct TopicArticles: Decodable, Sendable { let items: [Article]; let page: Int; let pageCount: Int }
struct TopicsView: View {
    @EnvironmentObject private var app: AppState
    var body: some View {
        RemoteView(load: { () async throws -> TopicDirectory in try await app.client!.siteGet("topics") }) { directory in
            List(directory.topics) { topic in
                NavigationLink { TopicView(slug: topic.slug, name: topic.name) } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(topic.name).font(.headline)
                        Text(topic.definition).font(.subheadline).foregroundStyle(.secondary)
                        Text("\(topic.total) 条精选").font(.caption).foregroundStyle(.tint)
                    }.padding(.vertical, 6)
                }
            }
        }.navigationTitle("金融主题").readingMetrics("/topics", entry: "金融主题")
    }
}
struct TopicView: View {
    let slug: String
    let name: String
    @EnvironmentObject private var app: AppState
    @State private var page = 1
    var body: some View {
        RemoteView(load: { () async throws -> TopicArticles in try await app.client!.siteGet("topics/\(slug)", query: [.init(name: "page", value: String(page))]) }) { result in
            List {
                ForEach(result.items) { item in NavigationLink { ArticleView(id: item.id) } label: { ArticleCard(item: item) } }
                HStack {
                    if page > 1 { Button("上一页") { page -= 1 } }
                    Spacer(); Text("\(page) / \(max(1, result.pageCount))").font(.caption)
                    Spacer(); if page < result.pageCount { Button("下一页") { page += 1 } }
                }.buttonStyle(.borderless)
            }
        }.id(page).navigationTitle(name).readingMetrics("/topics/detail", entry: "阅读主题")
    }
}
private struct PolicyDocument: Decodable {
    struct Field: Decodable { let label, value: String }
    struct Run: Decodable, Hashable {
        let text: String
        let url: URL?
    }
    struct Section: Decodable { let heading: String; let paragraphs: [[Run]] }
    let title, intro: String
    let metadata: [Field]
    let sections: [Section]

    static let bundled: [String: Self] = {
        guard let url = Bundle.main.url(forResource: "policies", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONDecoder().decode([String: Self].self, from: data)) ?? [:]
    }()
}

struct PolicyView: View {
    let name: String
    let file: String
    @AppStorage("readerTextSize") private var size = 0

    var body: some View {
        let document = PolicyDocument.bundled[file]
        ScrollView {
            if let document {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(document.metadata, id: \.label) { field in
                            LabeledContent(field.label) { Text(field.value).foregroundStyle(.primary) }
                                .foregroundStyle(.secondary)
                        }
                    }
                    .font(.subheadline)
                    .padding(16)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                    Text(document.intro)
                        .foregroundStyle(.secondary)
                        .padding(.leading, 12)
                        .overlay(alignment: .leading) { Capsule().fill(.tint).frame(width: 3) }
                    ForEach(document.sections, id: \.heading) { section in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(section.heading)
                                .font(size == 2 ? .title.bold() : .title3.bold())
                                .accessibilityAddTraits(.isHeader)
                            ForEach(section.paragraphs, id: \.self) { paragraph in
                                Text(paragraph.reduce(into: AttributedString()) { text, run in
                                    var span = AttributedString(run.text)
                                    span.link = run.url
                                    text.append(span)
                                })
                            }
                        }
                    }
                }
                .font(size == 2 ? .title2 : size == 1 ? .title3 : .body)
                .lineSpacing(5)
                .textSelection(.enabled)
                .frame(maxWidth: 640, alignment: .leading)
                .padding(20)
                .frame(maxWidth: .infinity)
            } else {
                Text("内容暂不可用。").padding()
            }
        }
        .navigationTitle(document?.title ?? name)
        .navigationBarTitleDisplayMode(.inline)
        .readingMetrics("/" + file, entry: name)
    }
}

struct ReadingHistoryView: View {
    @EnvironmentObject private var app: AppState
    var body: some View {
        List {
            if app.reading.readIDs.isEmpty {
                ContentUnavailableView("还没有阅读记录", systemImage: "clock", description: Text("成功打开资讯后，会在本机记录已读状态和阅读位置。"))
            }
            ForEach(app.reading.readIDs, id: \.self) { id in
                BookmarkRow(id: id)
                    .swipeActions { Button("标为未读") { app.markUnread(id) }.tint(.indigo) }
            }
        }.navigationTitle("阅读记录").readingMetrics("/more/history", entry: "阅读记录")
    }
}
