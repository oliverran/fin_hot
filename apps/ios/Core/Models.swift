import Foundation

// Native display models. PublicAPI.swift adapts the stable v1 contract; site-only details stay explicit.
public struct Source: Codable, Sendable { public let name: String }
public struct StoryRef: Codable, Sendable { public let publicId: String; public let title: String }
public struct Article: Codable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let summary: String?
    public let reason: String?
    public let source: Source
    public let publishedAt: String?
    public let timelineAt: String?
    public let discoveredAt: String?
    public let category: String?
    public let selected: Bool
}
public struct ItemsPage: Decodable, Sendable {
    public struct Page: Decodable, Sendable {
        public let hasMore: Bool
        public let nextCursor: String?
    }
    public let schemaVersion: Int
    public let items: [Article]
    public let page: Page
    public internal(set) var validUntil: Date? = nil
    private enum CodingKeys: String, CodingKey { case schemaVersion, items, page }
}
public struct ArticleDetail: Decodable, Sendable {
    public struct Links: Decodable, Sendable { public let original: String }
    public struct Body: Decodable, Sendable { public let zh: String?; public let original: String? }
    public let id: String
    public let title: String
    public let summary: String?
    public let reason: String?
    public let source: Source
    public let links: Links
    public let readingMode: String
    public let body: Body?
    public let relatedStories: [StoryRef]
}
public struct HotResponse: Sendable {
    public struct Entry: Identifiable, Sendable {
        public var id: String { story.publicId }
        public let rank: Int
        public let story: StoryRef
        public let sourceCount: Int
    }
    public let entries: [Entry]
}
public struct StoryDetail: Sendable {
    public struct Report: Decodable, Identifiable, Sendable {
        public let id: String
        public let title: String
        public let source: Source
        public let publishedAt: String
    }
    public let title: String
    public let digest: String?
    public let summary: String?
    public let sourceCount: Int
    public let reportCount: Int
    public let timeline: [Report]
}
public enum ReportKind: String, CaseIterable, Sendable {
    case daily, weekly, monthly
    public var label: String { switch self { case .daily: "日报"; case .weekly: "周报"; case .monthly: "月报" } }
    public var webPath: String { rawValue }
}
public struct ReportIndex: Sendable {
    public struct Entry: Decodable, Identifiable, Sendable {
        public var id: String { key }
        public let key: String
        public let title: String?
    }
    public let items: [Entry]
}
public struct ReportDetail: Sendable {
    public struct Lead: Decodable, Sendable { public let title: String; public let leadParagraph: String }
    public struct Citation: Decodable, Sendable {
        public let itemId: String?
        public let title: String
        public let summary: String?
        public let sourceName: String
        public let sourceURL: String?
        public let available: Bool
    }
    public struct Section: Decodable, Sendable {
        public let label: String
        public let summary: String?
        public let items: [Citation]
    }
    public let key: String
    public let title: String
    public let lead: Lead?
    public let overview: String?
    public let sections: [Section]
    public let flashes: [Citation]
}

public struct ChronicleSeries: Decodable, Sendable {
    public struct Meta: Decodable, Sendable {
        public let name: String
        public let type: String
        public let source: String?
        public let status: String?
        public let updatedAt: String?
        public let firstDate: String?
        public let lastDate: String?
    }
    private struct Point: Decodable {
        let date: String
        let value: Double
    }
    private struct MultiLine: Decodable {
        let dates: [String]
        let seriesData: [String: [Double?]]
    }
    public struct Line: Identifiable, Sendable {
        public var id: String { name }
        public let name: String
        public let values: [Double?]
    }
    public let meta: Meta
    public let dates: [String]
    public let lines: [Line]

    private enum CodingKeys: String, CodingKey { case meta, series }
    public init(from decoder: Decoder) throws {
        let fields = try decoder.container(keyedBy: CodingKeys.self)
        meta = try fields.decode(Meta.self, forKey: .meta)
        if meta.type == "multi-line", !(try fields.decodeNil(forKey: .series)),
           let multi = try? fields.decode(MultiLine.self, forKey: .series) {
            let length = multi.dates.count
            guard multi.seriesData.values.allSatisfy({ $0.count == length }) else {
                throw DecodingError.dataCorruptedError(forKey: .series, in: fields, debugDescription: "Series lengths differ from dates")
            }
            dates = multi.dates
            lines = multi.seriesData.sorted { $0.key < $1.key }.map { Line(name: $0.key, values: $0.value) }
        } else {
            let points = try fields.decode([Point].self, forKey: .series)
            dates = points.map(\.date)
            lines = [Line(name: meta.name, values: points.map(\.value))]
        }
    }
}

struct USMarketHistory: Decodable, Sendable {
    struct Observation: Decodable, Sendable {
        let date: String
        let close: Double?
        let value: Double?
    }
    let series: [Observation]
    let updated: String?
    let _attribution: String?
}

extension ChronicleSeries {
    init(history: USMarketHistory, slug: String, title: String) {
        meta = Meta(name: title, type: slug.hasSuffix("/annual-returns") ? "bar" : "line",
                    source: history._attribution, status: nil, updatedAt: history.updated,
                    firstDate: history.series.first?.date, lastDate: history.series.last?.date)
        dates = history.series.map(\.date)
        let values = slug.hasSuffix("/price") ? history.series.map(\.close) : history.series.map(\.value)
        lines = [Line(name: title, values: values)]
    }
}
