import Foundation

public struct ReadingState: Codable, Sendable {
    public struct Position: Codable, Sendable {
        public let fingerprint: String
        public let blockID: String
    }
    public private(set) var readIDs: [String] = []
    public private(set) var positions: [String: Position] = [:]
    public init() { }
    public func isRead(_ id: String) -> Bool { readIDs.contains(id) }
    public mutating func markRead(_ id: String) {
        readIDs.removeAll { $0 == id }
        readIDs.insert(id, at: 0)
        // Same history bound as the website; local state contains no article text.
        readIDs = Array(readIDs.prefix(5000))
        let retained = Set(readIDs)
        positions = positions.filter { retained.contains($0.key) }
    }
    public mutating func markUnread(_ id: String) {
        readIDs.removeAll { $0 == id }
        positions.removeValue(forKey: id)
    }
    public mutating func savePosition(articleID: String, fingerprint: String, blockID: String) {
        guard isRead(articleID) else { return }
        positions[articleID] = Position(fingerprint: fingerprint, blockID: blockID)
    }
    public func position(articleID: String, fingerprint: String) -> String? {
        guard let saved = positions[articleID], saved.fingerprint == fingerprint else { return nil }
        return saved.blockID
    }
}

// No content is persisted: page data lives only in the current feed screen.
public struct FeedWindow: Sendable {
    public private(set) var items: [Article] = []
    public private(set) var nextCursor: String?
    public private(set) var hasMore = false
    public private(set) var pageCount = 0
    public private(set) var validUntil: Date?
    public init() { }
    public mutating func append(_ page: ItemsPage) {
        for item in page.items {
            if let index = items.firstIndex(where: { $0.id == item.id }) { items[index] = item }
            else { items.append(item) }
        }
        nextCursor = page.page.nextCursor
        hasMore = page.page.hasMore && nextCursor != nil
        pageCount += 1
        if let deadline = page.validUntil { validUntil = min(validUntil ?? deadline, deadline) }
    }
    public static func restoredAnchor(_ preferred: String?, previousIDs: [String], visibleIDs: [String]) -> String? {
        let visible = Set(visibleIDs)
        if let preferred, visible.contains(preferred) { return preferred }
        if let preferred, let index = previousIDs.firstIndex(of: preferred) {
            if let next = previousIDs.dropFirst(index + 1).first(where: visible.contains) { return next }
            if let previous = previousIDs.prefix(index).reversed().first(where: visible.contains) { return previous }
        }
        return visibleIDs.first
    }
}

public struct ReadingCategory: Codable, Identifiable, Sendable {
    public var id: String { key }
    public let key: String
    public let label: String
}
