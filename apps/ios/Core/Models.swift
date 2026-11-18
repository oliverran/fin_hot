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
    public struct Point: Decodable, Identifiable, Sendable {
        public var id: String { date }
        public let date: String
        public let value: Double
    }
    public let meta: Meta
    public let series: [Point]
}
