import SwiftUI
import FinHOTCore

struct FeedView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.scenePhase) private var phase
    @State private var path: [String] = []
    @State private var mode = "selected"
    @State private var category = ""
    @State private var query = ""
    @State private var submitted = ""
    @State private var unreadOnly = false
    @State private var window = FeedWindow()
    @State private var loading = false
    @State private var loadedKey: Query?
    @State private var error: String?
    @State private var restartRequired = false
    @State private var generation = UUID()
    @State private var topID: String?
    @State private var returnAnchor: String?
    @State private var returnOrder: [String] = []
    @State private var restoreID: String?
    @State private var restoreToken = UUID()
    private struct Query: Equatable {
        let mode: String; let category: String; let search: String
    }
    private var filter: Query { Query(mode: mode, category: category, search: submitted) }
    private var visibleItems: [Article] { window.items.filter { !unreadOnly || !app.reading.isRead($0.id) } }
    var body: some View {
        NavigationStack(path: $path) {
            ScrollViewReader { proxy in
                List {
                    Section {
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 16) {
                                Text("最近 7 天").font(.subheadline).foregroundStyle(.secondary).fixedSize()
                                scopePicker
                            }
                            VStack(alignment: .leading) {
                                Text("最近 7 天").font(.subheadline).foregroundStyle(.secondary)
                                scopePicker
                            }
                        }.id("feed-start")
                        Picker("分类", selection: $category) {
                            Text("全部分类").tag("")
                            ForEach(app.categories) { Text($0.label).tag($0.key) }
                        }
                        Toggle("只看未读", isOn: $unreadOnly)
                    }
                    if !submitted.isEmpty { Text("搜索全部动态：\(submitted)").font(.caption).foregroundStyle(.secondary) }
                    ForEach(visibleItems) { item in
                        NavigationLink(value: item.id) {
                            ArticleCard(item: item)
                                .background(GeometryReader { geometry in
                                    Color.clear.preference(key: FeedRows.self, value: [item.id: geometry.frame(in: .named("feed")).minY])
                                })
                        }
                        .id(item.id)
                        .swipeActions(edge: .trailing) {
                            Button { app.toggle(item.id) } label: {
                                Label(app.bookmarks.ids.contains(item.id) ? "取消收藏" : "收藏", systemImage: "bookmark")
                            }.tint(.teal)
                        }
                        .swipeActions(edge: .leading) {
                            Button { if app.reading.isRead(item.id) { app.markUnread(item.id) } else { app.markRead(item.id) } } label: {
                                Label(app.reading.isRead(item.id) ? "标为未读" : "标为已读", systemImage: app.reading.isRead(item.id) ? "circle" : "checkmark.circle")
                            }.tint(.indigo)
                        }
                    }
                    if loading { ProgressView().frame(maxWidth: .infinity) }
                    if let error {
                        Section { Text(error).foregroundStyle(.secondary)
                            Button(restartRequired ? "刷新列表" : "重试") { Task { await fetch(reset: restartRequired || window.items.isEmpty) } }
                        }
                    }
                    if !loading && error == nil && visibleItems.isEmpty {
                        ContentUnavailableView(unreadOnly && !window.items.isEmpty ? "这些资讯已经读过了" : "暂无资讯", systemImage: unreadOnly ? "checkmark.circle" : "newspaper", description: Text(window.hasMore ? "可以继续加载更早的资讯。" : "试试其他分类、关键词，或稍后下拉刷新。"))
                        if unreadOnly { Button("查看全部已加载资讯") { unreadOnly = false } }
                    }
                    if window.hasMore && !loading { Button("加载更多") { Task { await fetch(reset: false) } }.frame(maxWidth: .infinity) }
                }
                .listStyle(.plain)
                .coordinateSpace(name: "feed")
                .onPreferenceChange(FeedRows.self) { rows in
                    guard path.isEmpty else { return }
                    topID = rows.filter { $0.value >= 0 }.min(by: { $0.value < $1.value })?.key
                }
                .onChange(of: restoreToken) { _, _ in proxy.scrollTo(restoreID ?? "feed-start", anchor: .top) }
                .onChange(of: unreadOnly) { _, _ in proxy.scrollTo("feed-start", anchor: .top) }
                .task(id: filter) { if loadedKey != filter { await fetch(reset: true) } }
                .refreshable { await fetch(reset: true) }
                .onChange(of: path) { old, new in
                    if old.isEmpty && !new.isEmpty {
                        returnAnchor = topID ?? new.first
                        returnOrder = visibleItems.map(\.id)
                        return
                    }
                    guard !old.isEmpty && new.isEmpty else { return }
                    if window.validUntil.map({ $0 <= Date() }) ?? true {
                        Task { await fetch(reset: true, restoring: true) }
                    } else { restorePosition() }
                }
                .onChange(of: phase) { _, phase in
                    if phase == .active && path.isEmpty && window.pageCount > 0 && (window.validUntil ?? .distantPast) <= Date() { returnAnchor = topID; returnOrder = visibleItems.map(\.id); Task { await fetch(reset: true, restoring: true) } }
                }
            }
            .navigationTitle("FinHOT")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { ArticleView(id: $0) }
            .searchable(text: $query, prompt: "搜索金融资讯")
            .onSubmit(of: .search) { submitted = query.trimmingCharacters(in: .whitespacesAndNewlines) }
            .onChange(of: query) { _, text in if text.isEmpty { submitted = "" } }
            .toolbar { ToolbarItem(placement: .topBarTrailing) { NavigationLink { TopicsView() } label: { Label("主题", systemImage: "square.grid.2x2") } } }
        }
    }
    private var scopePicker: some View {
        Picker("资讯范围", selection: submitted.isEmpty ? $mode : .constant("all")) {
            Text("精选").tag("selected")
            Text("全部动态").tag("all")
        }.pickerStyle(.segmented)
            .disabled(!submitted.isEmpty)
    }

    private func restorePosition() {
        restoreID = FeedWindow.restoredAnchor(returnAnchor, previousIDs: returnOrder, visibleIDs: visibleItems.map(\.id))
        restoreToken = UUID()
    }
    private func fetch(reset: Bool, restoring: Bool = false) async {
        guard let api = app.client, reset || !loading else { return }
        let key = filter
        let hadPages = window.pageCount > 0
        if reset { generation = UUID() }
        let token = generation
        let pages = restoring ? max(1, window.pageCount) : 1
        loading = true; error = nil; restartRequired = false
        if reset { window = FeedWindow(); loadedKey = key }
        var result = window
        do {
            for _ in 0..<pages {
                let page = try await api.items(mode: key.search.isEmpty ? key.mode : "all", search: key.search,
                                               category: key.category.isEmpty ? nil : key.category, cursor: result.nextCursor)
                try Task.checkCancellation()
                guard filter == key && generation == token else { return }
                result.append(page)
                if !result.hasMore { break }
            }
            guard filter == key && generation == token else { return }
            window = result; loading = false
            if restoring { restorePosition() }
            else if reset && hadPages { restoreID = nil; restoreToken = UUID() }
        } catch {
            guard filter == key && generation == token else { return }
            loading = false
            if !Task.isCancelled {
                if case ClientError.invalidCursor = error { restartRequired = true }
                self.error = error.localizedDescription
            } else { loadedKey = nil }
        }
    }
}
private struct FeedRows: PreferenceKey {
    static var defaultValue: [String: CGFloat] { [:] }
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) { value.merge(nextValue(), uniquingKeysWith: { _, new in new }) }
}

struct ArticleView: View {
    let id: String
    @EnvironmentObject private var app: AppState
    var body: some View {
        RemoteView(load: { () async throws -> ArticleDetail in try await app.client!.siteGet("items/\(id)") }) { item in
            ArticleReader(item: item, baseURL: app.client!.site.url)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { app.toggle(id) } label: {
                    Label(app.bookmarks.ids.contains(id) ? "取消收藏" : "收藏", systemImage: app.bookmarks.ids.contains(id) ? "bookmark.fill" : "bookmark")
                }
                if let url = app.client?.site.page("items/\(id)") { ShareLink(item: url) }
            }
        }
    }
}

private struct ArticleReader: View {
    let item: ArticleDetail
    @EnvironmentObject private var app: AppState
    @Environment(\.scenePhase) private var phase
    @AppStorage("readerTextSize") private var textSize = 0
    @State private var position: String?
    @State private var initialized = false
    private let document: ReadingDocument
    init(item: ArticleDetail, baseURL: URL) {
        self.item = item
        document = ReadingDocument(title: item.title, summary: item.summary, reason: item.reason,
                                   html: item.readingMode == "summary-only" ? nil : item.body?.zh ?? item.body?.original, baseURL: baseURL)
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 16) {
                    Text(item.source.name).font(.subheadline.weight(.semibold)).foregroundStyle(.tint)
                    Text(item.title).font(.largeTitle.bold())
                    if let summary = item.summary { Text(summary).font(textSize == 2 ? .title : textSize == 1 ? .title2 : .title3).textSelection(.enabled) }
                    if let reason = item.reason { GroupBox("为什么值得关注") { Text(reason).frame(maxWidth: .infinity, alignment: .leading) } }
                    Text(item.readingMode == "summary-only" ? "本站提供摘要，完整报道请阅读原文。" : "正文依据网站授权范围展示。")
                        .font(.footnote).foregroundStyle(.secondary)
                    Divider()
                }.id("intro")
                ForEach(document.blocks) { block in NativeReadingBlock(block: block).id(block.id) }
                VStack(alignment: .leading, spacing: 18) {
                    if let original = URL(string: item.links.original), ["https", "http"].contains(original.scheme ?? "") {
                        Link(destination: original) { Label("阅读来源原文", systemImage: "arrow.up.right.square") }
                    }
                    ForEach(item.relatedStories, id: \.publicId) { story in
                        NavigationLink { StoryView(id: story.publicId) } label: { Label(story.title, systemImage: "point.3.connected.trianglepath.dotted") }
                    }
                    Label("已读", systemImage: "checkmark.circle").font(.footnote).foregroundStyle(.secondary)
                }.id("end")
            }
            .scrollTargetLayout()
            .font(textSize == 2 ? .title2 : textSize == 1 ? .title3 : .body)
            .lineSpacing(6)
            .padding(22)
        }
        .scrollPosition(id: $position, anchor: .top)
        .onAppear {
            guard !initialized else { return }
            position = app.reading.position(articleID: item.id, fingerprint: document.fingerprint) ?? "intro"
            app.markRead(item.id)
            initialized = true
        }
        .onDisappear { save(document) }
        .onChange(of: phase) { _, phase in if phase != .active { save(document) } }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu { Picker("正文字号", selection: $textSize) { Text("标准").tag(0); Text("较大").tag(1); Text("大号").tag(2) } }
                label: { Label("阅读字号", systemImage: "textformat.size") }
            }
        }
    }
    private func save(_ document: ReadingDocument) {
        guard initialized, let position else { return }
        app.savePosition(item.id, fingerprint: document.fingerprint, blockID: position)
    }
}
