import SwiftUI
import FinHOTCore

struct ChroniclePage: Decodable, Identifiable {
    var id: String { "\(group)/\(slug)" }
    let group: String
    let slug: String
    let cardTitle: String
    let cardBlurb: String
    let chartNote: String

    static let us: [Self] = [
        .init(group: "us", slug: "sp500/price", cardTitle: "标普 500", cardBlurb: "美国大盘股指数的每日收盘走势。", chartNote: "按交易日展示标普 500 指数收盘点位。"),
        .init(group: "us", slug: "ndx/price", cardTitle: "纳斯达克 100", cardBlurb: "纳斯达克 100 指数的每日收盘走势。", chartNote: "按交易日展示纳斯达克 100 指数收盘点位。"),
        .init(group: "us", slug: "dow/century", cardTitle: "道琼斯工业平均指数", cardBlurb: "从月度观测看道指的长期走势。", chartNote: "按月展示指数点位，纵轴为线性刻度。"),
        .init(group: "us", slug: "sp500/annual-returns", cardTitle: "标普 500 年度涨跌幅", cardBlurb: "逐年比较指数价格涨跌。", chartNote: "按年展示价格涨跌幅（%），未结束的年份截至最近观测日。"),
        .init(group: "us", slug: "ndx/annual-returns", cardTitle: "纳斯达克 100 年度涨跌幅", cardBlurb: "逐年比较指数价格涨跌。", chartNote: "按年展示价格涨跌幅（%），未结束的年份截至最近观测日。")
    ]
}

private struct Note: Decodable { let title: String; let paragraphs: [String] }
private struct Passage: Decodable, Identifiable {
    let id, title, intro: String
    let caption, chart, path: String?
    let body, related: [String]?
    let notes: [Note]?
}
private struct Chapter: Decodable, Identifiable {
    let id, title, lead: String
    let passages: [Passage]
    let comparisons: [String]?
    let notes: [Note]?
}
private struct Volume: Decodable, Identifiable {
    let id, title, blurb: String
    let intro: [String]
    let chapters: [Chapter]
}
private struct Book: Decodable {
    let title: String
    let intro: [String]
    let volumes: [Volume]
    func location(passage: String? = nil, chart: String? = nil) -> (Volume, Chapter, Passage?)? {
        for volume in volumes {
            for chapter in volume.chapters {
                if let match = chapter.passages.first(where: { $0.id == passage || (chart != nil && $0.chart == chart) }) {
                    return (volume, chapter, match)
                }
                if let chart, chapter.comparisons?.contains(where: { "us/" + $0 == chart }) == true {
                    return (volume, chapter, nil)
                }
            }
        }
        return nil
    }
}
private struct Books: Decodable { let a, us: Book }
private struct Catalog {
    let books: Books
    let pages: [ChroniclePage]
    static let bundled = Result {
        func read<T: Decodable>(_ name: String) throws -> T {
            guard let url = Bundle.main.url(forResource: name, withExtension: "json") else { throw CocoaError(.fileNoSuchFile) }
            return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
        }
        let a: [ChroniclePage] = try read("chronicle")
        return try Catalog(books: read("chronicle-reading"), pages: a + ChroniclePage.us)
    }
}
private enum BookRoute: Hashable {
    case volume(String), chapter(String, String, anchor: String?), index, chart(String)
}

struct ChronicleView: View {
    var body: some View {
        switch Catalog.bundled {
        case .success(let catalog): BookHome(catalog: catalog)
        case .failure: ContentUnavailableView("编年史资源无法读取", systemImage: "book.closed")
        }
    }
}

private struct BookHome: View {
    let catalog: Catalog
    @State private var us = false
    @State private var expanded = false
    @State private var path: [BookRoute] = []
    private var book: Book { us ? catalog.books.us : catalog.books.a }
    private var pages: [ChroniclePage] { catalog.pages.filter { ($0.group == "us") == us } }

    var body: some View {
        NavigationStack(path: $path) {
            VStack {
                Picker("市场", selection: $us) { Text("A 股").tag(false); Text("美股").tag(true) }
                    .pickerStyle(.segmented).padding(.horizontal)
                List {
                    Section {
                        Text(book.title).font(.title2.bold())
                        ForEach(Array(book.intro.prefix(expanded ? book.intro.count : 1)), id: \.self) { Text($0).lineSpacing(4) }
                        Button(expanded ? "收起序言" : "完整序言") { expanded.toggle() }
                        NavigationLink("图表索引", value: BookRoute.index)
                    }
                    Section("分卷阅读") {
                        ForEach(book.volumes) { volume in
                            NavigationLink(value: BookRoute.volume(volume.id)) { row(volume.title, volume.blurb) }
                        }
                    }
                    if us { Link("编年史来源 · History of Market", destination: URL(string: "https://historyofmarket.com/")!) }
                }.listStyle(.plain).id(us)
            }
            .navigationTitle("编年史").readingMetrics("/chronicle")
            .onChange(of: us) { expanded = false }
            .navigationDestination(for: BookRoute.self) { route in destination(route) }
        }
    }

    private func row(_ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title).font(.headline)
            Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
        }.padding(.vertical, 6)
    }

    @ViewBuilder private func destination(_ route: BookRoute) -> some View {
        switch route {
        case .index:
            List(pages) { p in
                NavigationLink(value: BookRoute.chart(p.id)) { row(p.cardTitle, p.cardBlurb) }
            }.navigationTitle("图表索引").readingMetrics("/chronicle/charts", entry: "图表索引")
        case .chart(let id):
            if let page = pages.first(where: { $0.id == id }) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if let (v, c, p) = book.location(chart: id) {
                            NavigationLink("在章节中阅读 · \(c.title)", value: BookRoute.chapter(v.id, c.id, anchor: p?.id))
                        }
                        ChronicleFigure(page: page, fullHistory: false)
                    }.padding(20)
                }.readingMetrics("/chronicle/chart", entry: "打开图表").navigationTitle(page.cardTitle).navigationBarTitleDisplayMode(.inline)
            }
        case .volume(let id):
            if let volume = book.volumes.first(where: { $0.id == id }) {
                List {
                    Section {
                        ForEach(volume.intro.isEmpty ? [volume.blurb] : volume.intro, id: \.self) { Text($0).lineSpacing(4) }
                    }
                    Section("卷内目录") {
                        ForEach(Array(volume.chapters.enumerated()), id: \.element.id) { index, c in
                            NavigationLink("\(index + 1)　\(c.title)", value: BookRoute.chapter(id, c.id, anchor: nil))
                        }
                    }
                }.readingMetrics("/chronicle/volume", entry: "打开分卷").navigationTitle(volume.title)
            }
        case .chapter(let id, let chapterID, let anchor):
            if let v = book.volumes.first(where: { $0.id == id }), let c = v.chapters.first(where: { $0.id == chapterID }) {
                ChapterReader(book: book, volume: v, chapter: c, anchor: anchor, pages: pages, home: { path.removeAll() })
            }
        }
    }
}

private struct ChapterReader: View {
    let book: Book
    let volume: Volume
    let chapter: Chapter
    let anchor: String?
    let pages: [ChroniclePage]
    let home: () -> Void
    @EnvironmentObject private var app: AppState
    @AppStorage("readerTextSize") private var size = 0
    @State private var opened = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    Text("\(book.title) · \(volume.title)").font(.caption.bold()).foregroundStyle(.tint)
                    Text(chapter.title).font(.largeTitle.bold())
                    Text(chapter.lead).lineSpacing(5)
                    if chapter.passages.count > 1 {
                        Menu("本章目录") {
                            ForEach(chapter.passages) { p in Button(p.title) { proxy.scrollTo(p.id, anchor: .top) } }
                        }
                    }
                    ForEach(chapter.passages) { passage in
                        VStack(alignment: .leading, spacing: 14) {
                            Divider()
                            if let caption = passage.caption { Text(caption).font(.caption).foregroundStyle(.tint) }
                            Text(passage.title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
                            Text(passage.intro).lineSpacing(4)
                            if let id = passage.chart, let p = pages.first(where: { $0.id == id }) { ChronicleFigure(page: p, fullHistory: true) }
                            paragraphs(passage.body ?? [])
                            notes(passage.notes ?? [])
                            if let path = passage.path, let url = URL(string: path, relativeTo: app.client?.site.url) {
                                Link("在官网查看本节原图", destination: url.absoluteURL)
                            }
                            ForEach(passage.related ?? [], id: \.self) { ref in
                                if let (v, c, p) = book.location(passage: ref), let p {
                                    NavigationLink("关联阅读 · \(p.title)", value: BookRoute.chapter(v.id, c.id, anchor: p.id))
                                }
                            }
                        }.id(passage.id)
                    }
                    notes(chapter.notes ?? [])
                    if let comparisons = chapter.comparisons, !comparisons.isEmpty {
                        Text("对照阅读").font(.headline).foregroundStyle(.tint)
                        ForEach(comparisons, id: \.self) { slug in
                            if let p = pages.first(where: { $0.id == "us/" + slug }) { ChronicleFigure(page: p, fullHistory: true) }
                        }
                    }
                    Divider()
                    if let next = volume.chapters.drop(while: { $0.id != chapter.id }).dropFirst().first {
                        NavigationLink("接着读 · \(next.title)", value: BookRoute.chapter(volume.id, next.id, anchor: nil))
                    } else if let next = book.volumes.drop(while: { $0.id != volume.id }).dropFirst().first {
                        NavigationLink("接着读 · \(next.title)", value: BookRoute.volume(next.id))
                    } else { Text("全书读毕").font(.headline) }
                    Button("返回分卷目录", action: home)
                }.font(size == 2 ? .title2 : size == 1 ? .title3 : .body).padding(20)
            }
            .onAppear { if !opened { opened = true; if let anchor { proxy.scrollTo(anchor, anchor: .top) } } }
        }.readingMetrics("/chronicle/chapter", entry: "阅读章节").navigationTitle(volume.title).navigationBarTitleDisplayMode(.inline)
    }
    private func paragraphs(_ lines: [String]) -> some View {
        ForEach(Array(lines.enumerated()), id: \.offset) { _, text in Text(text).lineSpacing(4) }
    }
    private func notes(_ notes: [Note]) -> some View {
        ForEach(Array(notes.enumerated()), id: \.offset) { _, note in
            Text(note.title).font(.headline)
            paragraphs(note.paragraphs)
        }
    }
}
