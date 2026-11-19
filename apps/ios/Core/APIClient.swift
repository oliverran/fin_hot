import Foundation

public enum ClientError: LocalizedError {
    case invalidSite, invalidResponse, invalidSearch, invalidCursor, retryLater(Date), http(Int)
    public var errorDescription: String? {
        switch self {
        case .invalidSite: "请输入不含路径、账号或参数的 HTTPS 网站地址。"
        case .invalidResponse: "网站返回了无法识别的数据。"
        case .invalidSearch: "请输入 2–200 个字符的搜索词。"
        case .invalidCursor: "列表的时间范围已变化，请刷新列表。"
        case .retryLater(let date): "服务繁忙，请在 \(date.formatted(date: .omitted, time: .standard)) 后重试。"
        case .http(404): "内容尚未发布或已不可用。"
        case .http(429): "访问较频繁，请稍后刷新。"
        case .http(let status): "网站暂时无法响应（\(status)），请稍后重试。"
        }
    }
}
public struct SiteAddress: Sendable, Equatable {
    public let url: URL
    public init(_ text: String, allowLocalHTTP: Bool = false) throws {
        guard let parts = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil, parts.path.isEmpty || parts.path == "/",
              parts.scheme == "https" || (allowLocalHTTP && parts.scheme == "http" && ["localhost", "127.0.0.1", "::1", "[::1]"].contains(host)),
              let url = parts.url else { throw ClientError.invalidSite }
        self.url = url
    }
    public func page(_ path: String) -> URL { url.appendingPathComponent(path) }
}
public struct APIClient: Sendable {
    public let site: SiteAddress
    private let session: URLSession
    private let chartCache = ChartCache()
    private let cooldown = RequestCooldown()
    private static let readingSession: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = URLCache(memoryCapacity: 8 * 1024 * 1024, diskCapacity: 0, diskPath: nil)
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration)
    }()
    public init(site: SiteAddress, session: URLSession? = nil) {
        self.site = site
        self.session = session ?? Self.readingSession
    }
    public func collect(kind: String, path: String, visitor: String, label: String? = nil) async {
        var body = ["kind": kind, "path": path, "visitor": visitor]
        body["label"] = label
        var request = URLRequest(url: site.page("api/analytics/collect"), timeoutInterval: 4)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("FinHOT-iOS/0.1", forHTTPHeaderField: "User-Agent")
        request.httpBody = try? JSONEncoder().encode(body)
        _ = try? await session.data(for: request)
    }
    public func siteGet<T: Decodable & Sendable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        return try await resource("api/site/" + path, query: query)
    }
    public func resource<T: Decodable & Sendable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        let response: (value: T, deadline: Date) = try await response(path, query: query)
        return response.value
    }
    public func chart(group: String, slug: String, title: String) async throws -> ChronicleSeries {
        let path = group == "us" ? "us-market/api/\(slug).json" : "api/chronicle/\(group)/\(slug).json"
        if let cached = await chartCache.value(path) { return cached }
        let series: ChronicleSeries
        let expiry: Date
        if group == "us" {
            let history: (value: USMarketHistory, deadline: Date) = try await response(path, query: [])
            series = ChronicleSeries(history: history.value, slug: slug, title: title)
            expiry = history.deadline
        } else {
            (series, expiry) = try await response(path, query: [])
        }
        await chartCache.save(series, path: path, expiry: expiry)
        return series
    }
    func response<T: Decodable & Sendable>(_ path: String, query: [URLQueryItem]) async throws -> (value: T, deadline: Date) {
        try await cooldown.check()
        var components = URLComponents(url: site.page(path), resolvingAgainstBaseURL: false)!
        components.queryItems = query.isEmpty ? nil : query
        var request = URLRequest(url: components.url!, cachePolicy: path.hasPrefix("api/v1/") ? .useProtocolCachePolicy : .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("FinHOT-iOS/0.1", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if [429, 503].contains(http.statusCode), let raw = http.value(forHTTPHeaderField: "Retry-After"),
               let deadline = Self.retryDate(raw), deadline > Date() {
                await cooldown.record(deadline)
                throw ClientError.retryLater(deadline)
            }
            if http.statusCode == 400,
               let problem = try? JSONDecoder().decode(Problem.self, from: data), problem.code == "invalid_cursor" {
                throw ClientError.invalidCursor
            }
            throw ClientError.http(http.statusCode)
        }
        do { return (try JSONDecoder().decode(T.self, from: data), Self.deadline(http)) }
        catch { throw ClientError.invalidResponse }
    }
    private struct Problem: Decodable { let code: String? }
    private static func retryDate(_ value: String) -> Date? {
        if let seconds = Double(value), seconds.isFinite, seconds >= 0 { return Date().addingTimeInterval(seconds) }
        return httpDate(value)
    }
    private static func httpDate(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter.date(from: value)
    }
    private static func deadline(_ response: HTTPURLResponse) -> Date {
        let now = Date()
        let policy = (response.value(forHTTPHeaderField: "Cache-Control") ?? "").lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard !policy.contains("no-store"), !policy.contains("no-cache"),
              let maxAge = policy.first(where: { $0.hasPrefix("max-age=") }).flatMap({ Double($0.dropFirst(8)) }) else { return now }
        let statedAge = Double(response.value(forHTTPHeaderField: "Age") ?? "0") ?? 0
        let datedAge = response.value(forHTTPHeaderField: "Date").flatMap(httpDate).map { now.timeIntervalSince($0) } ?? 0
        return now.addingTimeInterval(max(0, maxAge - max(0, max(statedAge, datedAge))))
    }
}

private actor ChartCache {
    private var entries: [(path: String, series: ChronicleSeries, expiry: Date)] = []
    func value(_ path: String) -> ChronicleSeries? {
        guard let index = entries.firstIndex(where: { $0.path == path }) else { return nil }
        let entry = entries.remove(at: index)
        guard entry.expiry > Date() else { return nil }
        entries.append(entry)
        return entry.series
    }
    func save(_ series: ChronicleSeries, path: String, expiry: Date) {
        entries.removeAll { $0.path == path }
        guard expiry > Date() else { return }
        entries.append((path, series, expiry))
        if entries.count > 4 { entries.removeFirst() }
    }
}

// Shared by a client's copies across tabs. No automatic retry loop.
private actor RequestCooldown {
    private var until: Date?
    func check() throws { if let until, until > Date() { throw ClientError.retryLater(until) } }
    func record(_ date: Date) { until = max(until ?? date, date) }
}

// Bookmarks keep identifiers only: reopening always checks current publication permissions.
public struct BookmarkStore: Sendable {
    public private(set) var ids: [String]
    public init(ids: [String] = []) { self.ids = ids.reduce(into: []) { result, id in if !result.contains(id) { result.append(id) } } }
    public mutating func toggle(_ id: String) {
        if ids.contains(id) { ids.removeAll { $0 == id } } else { ids.insert(id, at: 0) }
    }
}
