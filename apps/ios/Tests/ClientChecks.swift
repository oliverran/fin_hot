import Foundation
import FinHOTCore

final class StubProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let url = request.url!
        let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let query = Dictionary(uniqueKeysWithValues: (parts.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        var status = 200
        var headers = ["Content-Type": "application/json"]
        var json: [String: Any] = [:]
        if query["q"] == "aged-cache" { headers["Cache-Control"] = "public, max-age=60, must-revalidate"; headers["Age"] = "59" }
        if query["q"] == "fresh-cache" { headers["Cache-Control"] = "public, max-age=600, must-revalidate" }
        let id = "89d6c77b-ff94-427e-89aa-264acc927d4e"
        if url.lastPathComponent == "removed" { status = 404 }
        else if query["q"] == "expired" { status = 400; json = ["code": "invalid_cursor"] }
        else if query["q"] == "busy" { status = 429; headers["Retry-After"] = "30" }
        else if url.path == "/api/v1/items" {
            json = ["schemaVersion": 1, "items": [["id": "article-1", "title": query["q"] ?? "央行公告", "summary": NSNull(), "reason": query["cursor"] ?? "理由", "source": ["name": "央行"], "publishedAt": NSNull(), "discoveredAt": "2026-11-17T08:00:00Z", "category": query["category"] as Any? ?? NSNull(), "selected": true]], "page": ["hasMore": true, "nextCursor": "opaque+/="]]
        } else if url.path == "/api/v1/hot-topics" {
            json = ["schemaVersion": 1, "items": [["rank": 1, "id": "representative-article", "title": "金融事件", "sourceCount": 3, "links": ["story": "https://www.finhub.website/story/\(id)"]]]]
        } else if url.path.hasPrefix("/api/v1/stories/") {
            json = ["schemaVersion": 1, "story": ["title": "金融事件", "digest": "综述", "latest": "最新进展", "sourceCount": 3, "reportCount": 1, "reports": [["id": "article-1", "title": "央行公告", "source": ["name": "央行"], "publishedAt": "2026-11-17T08:00:00Z"]]]]
        } else if ["dailies", "weeklies", "monthlies"].contains(url.lastPathComponent) {
            let field = url.lastPathComponent == "dailies" ? "date" : url.lastPathComponent == "weeklies" ? "week" : "month"
            let key = field == "date" ? "2026-11-17" : field == "week" ? "2026-W46" : "2026-10"
            json = ["schemaVersion": 1, "items": [[field: key, "leadTitle": "金融简报", "headline": "金融简报"]]]
        } else if url.path.hasPrefix("/api/v1/") && url.path.contains("lies/") {
            let field = url.path.contains("dailies") ? "date" : url.path.contains("weeklies") ? "week" : "month"
            // Withdrawn citations are absent from the public response, as in the server read layer.
            json = ["schemaVersion": 1, "report": [field: url.lastPathComponent, "headline": "金融简报", "sections": [["label": "政策", "items": [["title": "央行公告", "summary": "公开摘要", "source": ["name": "央行"], "links": ["aihot": "https://www.finhub.website/items/article-1", "original": "https://example.com/notice"]]]]], "flashes": []]]
        } else { json = ["url": url.absoluteString, "accept": request.value(forHTTPHeaderField: "Accept") ?? ""] }
        let body = url.lastPathComponent == "broken" ? Data("<html>maintenance</html>".utf8) : try! JSONSerialization.data(withJSONObject: json)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: headers)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { }
}
@main struct ClientChecks {
    static func main() async throws {
        let checks = ClientChecks()
        try checks.testSiteAddress()
        try await checks.testSearchAndOpaqueCursor()
        try await checks.testSupplementalModuleRoute()
        try await checks.testWithdrawnContentAndInvalidPayload()
        try await checks.testHotStoryIdentityAndTimeline()
        try await checks.testThreeReportKinds()
        try await checks.testRetryAfterAndInvalidCursor()
        try await checks.testSearchValidation()
        checks.testBookmarks()
        try checks.testMissingChartData()
        try checks.testReadingRoundTrip()
        try checks.testReadingDocumentAndCorrections()
        try checks.testFeedWindowMergesWithoutReordering()
        checks.testRestorationAfterUnreadAndWithdrawal()
        try checks.testReadBookmarkReturnLoop()
        try await checks.testAppendingPagesDoesNotRenewOldContent()
        print("Passed 16 native core behavior checks.")
    }
    func testSiteAddress() throws {
        for value in ["", "www.finhub.website", "http://www.finhub.website", "https://user:secret@host.com", "https://host.com/api", "https://host.com?token=x", "https://host.com/#x", "file:///tmp/a"] {
            expectThrows { _ = try SiteAddress(value) }
        }
        expectEqual(try SiteAddress(" https://www.finhub.website/ ").page("api/v1/items").absoluteString, "https://www.finhub.website/api/v1/items")
        _ = try SiteAddress("http://127.0.0.1:3000", allowLocalHTTP: true)
        expectThrows { _ = try SiteAddress("http://192.168.1.2:3000", allowLocalHTTP: true) }
    }
    private func client() throws -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return APIClient(site: try SiteAddress("https://www.finhub.website"), session: URLSession(configuration: config))
    }
    func testSearchAndOpaqueCursor() async throws {
        let result = try await client().items(mode: "all", search: "央行 & A+B?", category: "policy", cursor: "opaque+/=")
        expectEqual(result.items.first?.title, "央行 & A+B?")
        expectEqual(result.items.first?.reason, "opaque+/=")
        expectEqual(result.items.first?.source.name, "央行")
        expectEqual(result.items.first?.category, "policy")
        expectEqual(result.page.nextCursor, "opaque+/=")
        expectTrue(result.items.first?.publishedAt == nil)
    }
    func testSupplementalModuleRoute() async throws {
        let result: [String: String] = try await client().resource("api/chronicle/broad/hs300.json")
        expectEqual(URL(string: result["url"]!)?.path, "/api/chronicle/broad/hs300.json")
        expectEqual(result["accept"], "application/json")
    }
    func testWithdrawnContentAndInvalidPayload() async throws {
        do { let _: ArticleDetail = try await client().siteGet("items/removed"); fatalError("404 must not produce an article") }
        catch ClientError.http(let status) { expectEqual(status, 404) }
        do { let _: ItemsPage = try await client().resource("broken"); fatalError("HTML is not feed JSON") }
        catch ClientError.invalidResponse { }
    }
    func testHotStoryIdentityAndTimeline() async throws {
        let api = try client()
        let hot = try await api.hotTopics()
        expectEqual(hot.entries.first?.id, "89d6c77b-ff94-427e-89aa-264acc927d4e")
        let story = try await api.story(id: hot.entries[0].id)
        expectEqual(story.digest, "综述")
        expectEqual(story.timeline.first?.id, "article-1")
    }
    func testThreeReportKinds() async throws {
        for kind in ReportKind.allCases {
            let api = try client()
            let index = try await api.reportIndex(kind: kind)
            let report = try await api.report(kind: kind, key: index.items[0].key)
            expectEqual(report.key, index.items[0].key)
            expectEqual(report.sections[0].items.count, 1)
            expectEqual(report.sections[0].items[0].itemId, "article-1")
        }
    }
    func testRetryAfterAndInvalidCursor() async throws {
        let api = try client()
        do { _ = try await api.items(mode: "all", search: "expired"); fatalError("Expected invalid cursor") }
        catch ClientError.invalidCursor { }
        do { _ = try await api.items(mode: "all", search: "busy"); fatalError("Expected rate limit") }
        catch ClientError.retryLater(let until) { expectTrue(until > Date()) }
        do { _ = try await api.hotTopics(); fatalError("Must wait before another request") }
        catch ClientError.retryLater { }
    }
    func testSearchValidation() async throws {
        for search in ["字", String(repeating: "a", count: 201)] {
            do { _ = try await client().items(mode: "all", search: search); fatalError("Expected validation error") }
            catch ClientError.invalidSearch { }
        }
    }
    func testBookmarks() {
        expectEqual(BookmarkStore(ids: ["z", "a", "z", "b"]).ids, ["z", "a", "b"])
        var store = BookmarkStore(ids: ["a", "a"])
        expectEqual(store.ids, ["a"])
        store.toggle("b"); expectEqual(store.ids, ["b", "a"])
        store.toggle("a"); expectEqual(store.ids, ["b"])
    }
    func testMissingChartData() throws {
        let data = Data(#"{"meta":{"name":"沪深300","type":"line","status":"missing","source":"腾讯证券公开行情接口"},"series":[]}"#.utf8)
        let result = try JSONDecoder().decode(ChronicleSeries.self, from: data)
        expectEqual(result.meta.status, "missing")
        expectTrue(result.series.isEmpty)
    }
    func testReadingRoundTrip() throws {
        var reading = ReadingState()
        reading.markRead("article-1")
        reading.savePosition(articleID: "article-1", fingerprint: "version-1", blockID: "body-2")
        reading.markRead("article-2")
        reading.markRead("article-1")
        let data = try JSONEncoder().encode(reading)
        let restored = try JSONDecoder().decode(ReadingState.self, from: data)
        expectEqual(restored.readIDs, ["article-1", "article-2"])
        expectEqual(restored.position(articleID: "article-1", fingerprint: "version-1"), "body-2")
        expectTrue(restored.position(articleID: "article-1", fingerprint: "corrected") == nil)
        reading.markUnread("article-1")
        expectTrue(!reading.isRead("article-1"))
        expectTrue(reading.position(articleID: "article-1", fingerprint: "version-1") == nil)
    }
    func testReadingDocumentAndCorrections() throws {
        let site = URL(string: "https://www.finhub.website")!
        let html = "<h2>小节</h2><p>第一段<a href='https://example.com'>链接</a></p><img src='/cover.png?a=1&amp;b=2'><p>第二段</p>"
        let document = ReadingDocument(title: "标题", summary: "摘要", reason: nil, html: html, baseURL: site)
        expectEqual(document.blocks.count, 4)
        expectEqual(document.blocks[0].headingLevel, 2)
        expectTrue(document.blocks[1].html!.contains("href="))
        expectEqual(document.blocks[2].imageURL?.absoluteString, "https://www.finhub.website/cover.png?a=1&b=2")
        let same = ReadingDocument(title: "标题", summary: "摘要", reason: nil, html: html, baseURL: site)
        expectEqual(same.fingerprint, document.fingerprint)
        let revoked = ReadingDocument(title: "标题", summary: "摘要", reason: nil, html: nil, baseURL: site)
        expectTrue(revoked.fingerprint != document.fingerprint)
        expectTrue(revoked.blocks.isEmpty)
    }
    private func page(_ records: [(String, String)], next: String?) throws -> ItemsPage {
        let items: [[String: Any]] = records.map { ["id": $0.0, "title": $0.1, "source": ["name": "测试来源"], "selected": true] }
        let data = try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "items": items, "page": ["hasMore": next != nil, "nextCursor": next as Any? ?? NSNull()]])
        return try JSONDecoder().decode(ItemsPage.self, from: data)
    }
    func testFeedWindowMergesWithoutReordering() throws {
        var window = FeedWindow()
        window.append(try page([("a", "旧标题"), ("b", "第二条")], next: "opaque"))
        window.append(try page([("a", "修正后的标题"), ("c", "第三条")], next: nil))
        expectEqual(window.items.map(\.id), ["a", "b", "c"])
        expectEqual(window.items[0].title, "修正后的标题")
        expectTrue(!window.hasMore)
        expectEqual(window.pageCount, 2)
        window = FeedWindow() // New filter starts a new query, with no cursor from the old category.
        expectTrue(window.nextCursor == nil)
    }
    func testRestorationAfterUnreadAndWithdrawal() {
        let old = ["a", "b", "c", "d"]
        expectEqual(FeedWindow.restoredAnchor("b", previousIDs: old, visibleIDs: ["a", "b", "c"]), "b")
        expectEqual(FeedWindow.restoredAnchor("b", previousIDs: old, visibleIDs: ["a", "c", "d"]), "c")
        expectEqual(FeedWindow.restoredAnchor("d", previousIDs: old, visibleIDs: ["a", "c"]), "c")
        expectTrue(FeedWindow.restoredAnchor("b", previousIDs: old, visibleIDs: []) == nil)
    }
    func testReadBookmarkReturnLoop() throws {
        var window = FeedWindow()
        window.append(try page([("a", "第一条"), ("b", "第二条")], next: nil))
        var reading = ReadingState()
        var bookmarks = BookmarkStore()
        reading.markRead("a")
        reading.savePosition(articleID: "a", fingerprint: "body-v1", blockID: "body-3")
        bookmarks.toggle("a")
        let unread = window.items.filter { !reading.isRead($0.id) }.map(\.id)
        expectEqual(unread, ["b"])
        expectEqual(FeedWindow.restoredAnchor("a", previousIDs: window.items.map(\.id), visibleIDs: unread), "b")
        expectEqual(BookmarkStore(ids: bookmarks.ids).ids, ["a"])
        expectEqual(reading.position(articleID: "a", fingerprint: "body-v1"), "body-3")
        reading.markUnread("a")
        expectEqual(window.items.filter { !reading.isRead($0.id) }.map(\.id), ["a", "b"])
        expectEqual(bookmarks.ids, ["a"])
    }

    func testAppendingPagesDoesNotRenewOldContent() async throws {
        let api = try client()
        let aged = try await api.items(mode: "all", search: "aged-cache")
        expectTrue(aged.validUntil! <= Date().addingTimeInterval(1.1))
        let fresh = try await api.items(mode: "all", search: "fresh-cache")
        var window = FeedWindow()
        window.append(aged)
        window.append(fresh)
        expectEqual(window.validUntil, aged.validUntil)
    }

}
private func expectEqual<T: Equatable>(_ actual: T, _ expected: T, file: StaticString = #file, line: UInt = #line) {
    precondition(actual == expected, "Expected \(expected), got \(actual)", file: file, line: line)
}
private func expectTrue(_ actual: Bool) { precondition(actual) }
private func expectThrows(_ body: () throws -> Void) { do { try body(); fatalError("Expected an error") } catch { } }
