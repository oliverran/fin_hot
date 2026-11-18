import Foundation

extension ReportKind {
    var collection: String { switch self { case .daily: "dailies"; case .weekly: "weeklies"; case .monthly: "monthlies" } }
}

extension APIClient {
    public func items(mode: String, search: String = "", category: String? = nil, cursor: String? = nil) async throws -> ItemsPage {
        let search = search.trimmingCharacters(in: .whitespacesAndNewlines)
        if !search.isEmpty && !(2...200).contains(search.unicodeScalars.count) { throw ClientError.invalidSearch }
        var query = [URLQueryItem(name: "mode", value: mode), .init(name: "window", value: "7d"),
                     .init(name: "by", value: "timeline"), .init(name: "limit", value: "30")]
        if !search.isEmpty { query.append(.init(name: "q", value: search)) }
        if let category { query.append(.init(name: "category", value: category)) }
        if let cursor { query.append(.init(name: "cursor", value: cursor)) }
        let response: (value: ItemsPage, deadline: Date) = try await response("api/v1/items", query: query)
        var result = response.value
        result.validUntil = response.deadline
        guard result.schemaVersion == 1 else { throw ClientError.invalidResponse }
        return result
    }
    public func hotTopics() async throws -> HotResponse {
        let result: CollectionPayload<HotPayload> = try await resource("api/v1/hot-topics")
        try result.validate()
        return HotResponse(entries: try result.items.map { item in
            guard let id = routeID(item.links.story, prefix: "/story/"), UUID(uuidString: id) != nil else { throw ClientError.invalidResponse }
            return HotResponse.Entry(rank: item.rank, story: StoryRef(publicId: id, title: item.title), sourceCount: item.sourceCount)
        })
    }
    public func story(id: String) async throws -> StoryDetail {
        let result: StoryPayload = try await resource("api/v1/stories/\(id)")
        guard result.schemaVersion == 1 else { throw ClientError.invalidResponse }
        let story = result.story
        return StoryDetail(title: story.title, digest: story.digest, summary: story.latest,
                           sourceCount: story.sourceCount, reportCount: story.reportCount, timeline: story.reports)
    }
    public func reportIndex(kind: ReportKind) async throws -> ReportIndex {
        let result: CollectionPayload<IssuePayload> = try await resource("api/v1/\(kind.collection)", query: [.init(name: "limit", value: kind == .daily ? "180" : "60")])
        try result.validate()
        return ReportIndex(items: try result.items.map { item in
            guard let key = item.key(kind) else { throw ClientError.invalidResponse }
            return ReportIndex.Entry(key: key, title: item.leadTitle ?? item.headline)
        })
    }
    public func report(kind: ReportKind, key: String) async throws -> ReportDetail {
        let result: ReportPayload = try await resource("api/v1/\(kind.collection)/\(key)")
        guard result.schemaVersion == 1, let date = result.report.key(kind) else { throw ClientError.invalidResponse }
        let report = result.report
        return ReportDetail(key: date, title: report.lead?.title ?? report.headline ?? "金融\(kind.label)",
                            lead: report.lead, overview: report.overview,
                            sections: report.sections.map { section in
                                ReportDetail.Section(label: section.label, summary: section.summary, items: section.items.map(citation))
                            }, flashes: (report.flashes ?? []).map(citation))
    }
}

// Public v1 has no standalone item-detail, topic or chart endpoints. Those remain site/module calls.
private struct CollectionPayload<Item: Decodable & Sendable>: Decodable, Sendable {
    let schemaVersion: Int
    let items: [Item]
    func validate() throws { guard schemaVersion == 1 else { throw ClientError.invalidResponse } }
}
private struct HotPayload: Decodable, Sendable {
    struct Links: Decodable, Sendable { let story: String }
    let rank: Int; let title: String; let sourceCount: Int; let links: Links
}
private struct StoryPayload: Decodable, Sendable {
    struct Story: Decodable, Sendable {
        let title: String; let digest: String?; let latest: String?
        let sourceCount: Int; let reportCount: Int
        let reports: [StoryDetail.Report]
    }
    let schemaVersion: Int
    let story: Story
}
private struct IssuePayload: Decodable, Sendable {
    let date: String?; let week: String?; let month: String?
    let leadTitle: String?; let headline: String?
    func key(_ kind: ReportKind) -> String? { switch kind { case .daily: date; case .weekly: week; case .monthly: month } }
}
private struct CitationPayload: Decodable, Sendable {
    struct Links: Decodable, Sendable { let aihot: String?; let original: String }
    let title: String; let summary: String?; let source: Source; let links: Links
}
private struct ReportPayload: Decodable, Sendable {
    struct Report: Decodable, Sendable {
        struct Section: Decodable, Sendable { let label: String; let summary: String?; let items: [CitationPayload] }
        let date: String?; let week: String?; let month: String?
        let headline: String?; let overview: String?; let lead: ReportDetail.Lead?
        let sections: [Section]; let flashes: [CitationPayload]?
        func key(_ kind: ReportKind) -> String? { switch kind { case .daily: date; case .weekly: week; case .monthly: month } }
    }
    let schemaVersion: Int
    let report: Report
}
private func routeID(_ link: String?, prefix: String) -> String? {
    guard let link, let url = URL(string: link), url.path.hasPrefix(prefix) else { return nil }
    let id = String(url.path.dropFirst(prefix.count))
    return !id.isEmpty && id.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }) ? id : nil
}
private func citation(_ item: CitationPayload) -> ReportDetail.Citation {
    // v1 already omits withdrawn citations in the publication layer.
    ReportDetail.Citation(itemId: routeID(item.links.aihot, prefix: "/items/"), title: item.title, summary: item.summary,
                          sourceName: item.source.name, sourceURL: item.links.original, available: true)
}
