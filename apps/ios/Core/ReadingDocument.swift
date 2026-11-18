import Foundation
import CryptoKit

// The server supplies sanitized HTML. Split it into native reading targets, without storing the body.
public struct ReadingDocument: Sendable {
    public struct Block: Identifiable, Sendable {
        public let id: String
        public let html: String?
        public let headingLevel: Int?
        public let imageURL: URL?
    }
    public let fingerprint: String
    public let blocks: [Block]
    public init(title: String, summary: String?, reason: String?, html: String?, baseURL: URL) {
        let content = [title, summary ?? "", reason ?? "", html ?? ""]
        let bytes = (try? JSONEncoder().encode(content)) ?? Data()
        fingerprint = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        let html = html ?? ""
        let input = html as NSString
        let boundaries = try! NSRegularExpression(pattern: #"<img\b[^>]*>|</(?:p|h[1-6]|li|blockquote|pre|table|div|figure)\s*>|<br\s*/?>"#, options: .caseInsensitive)
        let imageSource = try! NSRegularExpression(pattern: #"\bsrc\s*=\s*["']([^"']+)["']"#, options: .caseInsensitive)
        let heading = try! NSRegularExpression(pattern: #"<h([1-6])\b"#, options: .caseInsensitive)
        var result: [Block] = []
        var offset = 0
        func append(_ text: String) {
            let plain = text.replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !plain.isEmpty else { return }
            let range = NSRange(text.startIndex..., in: text)
            let level = heading.firstMatch(in: text, range: range).flatMap { Int((text as NSString).substring(with: $0.range(at: 1))) }
            result.append(Block(id: "body-\(result.count)", html: text, headingLevel: level, imageURL: nil))
        }
        for boundary in boundaries.matches(in: html, range: NSRange(location: 0, length: input.length)) {
            let tag = input.substring(with: boundary.range)
            if tag.lowercased().hasPrefix("<img") {
                append(input.substring(with: NSRange(location: offset, length: boundary.range.location - offset)))
                if let match = imageSource.firstMatch(in: tag, range: NSRange(tag.startIndex..., in: tag)),
                   let url = URL(string: (tag as NSString).substring(with: match.range(at: 1)).replacingOccurrences(of: "&amp;", with: "&"), relativeTo: baseURL)?.absoluteURL,
                   ["http", "https"].contains(url.scheme ?? "") {
                    result.append(Block(id: "body-\(result.count)", html: nil, headingLevel: nil, imageURL: url))
                }
            } else {
                append(input.substring(with: NSRange(location: offset, length: NSMaxRange(boundary.range) - offset)))
            }
            offset = NSMaxRange(boundary.range)
        }
        append(input.substring(from: offset))
        blocks = result
    }
}
