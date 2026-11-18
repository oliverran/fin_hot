import SwiftUI
import FinHOTCore
import UIKit

func readingErrorMessage(_ error: Error) -> String {
    guard let networkError = error as? URLError else { return error.localizedDescription }
    switch networkError.code {
    case .notConnectedToInternet, .networkConnectionLost:
        return "网络连接已中断。恢复连接后可重试。"
    case .timedOut:
        return "网站响应超时，请稍后重试。"
    default:
        return networkError.localizedDescription
    }
}

struct RemoteView<Value: Sendable, Content: View>: View {
    let load: () async throws -> Value
    @ViewBuilder let content: (Value) -> Content
    @State private var value: Value?
    @State private var error: String?
    @Environment(\.scenePhase) private var phase
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let value { content(value) }
            else if let error {
                ContentUnavailableView {
                    Label("暂时无法读取", systemImage: "wifi.exclamationmark")
                } description: { Text(error) } actions: { Button("重试") { Task { await refresh() } } }
            } else { ProgressView("正在读取…").frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .task { await refresh() }
        .refreshable { await refresh() }
        .onChange(of: phase) { _, phase in if phase == .active { Task { await refresh() } } }
    }
    private func refresh() async {
        value = nil
        error = nil
        do { let result = try await load(); try Task.checkCancellation(); value = result }
        catch is CancellationError { }
        catch { if !Task.isCancelled { self.error = readingErrorMessage(error) } }
    }
}

struct ReadingRoute: Hashable { let id: String }

struct ArticleCard: View {
    let item: Article
    @EnvironmentObject private var app: AppState
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(item.source.name).font(.caption.weight(.semibold)).foregroundStyle(.tint)
                Spacer()
                if app.bookmarks.ids.contains(item.id) { Image(systemName: "bookmark.fill").accessibilityLabel("已收藏") }
                Text(app.reading.isRead(item.id) ? "已读" : "未读").font(.caption2).foregroundStyle(.secondary)
                if item.selected { Text("精选").font(.caption2).foregroundStyle(.secondary) }
            }
            Text(item.title).font(.headline).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
            if let summary = item.summary, !summary.isEmpty {
                Text(summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
            }
            HStack(spacing: 8) {
                if let category = app.categories.first(where: { $0.key == item.category }) {
                    Text(category.label)
                }
                if let timestamp = item.publishedAt ?? item.timelineAt ?? item.discoveredAt {
                    Text(Self.timestamp(timestamp))
                }
            }.font(.caption).foregroundStyle(.secondary)
        }.padding(.vertical, 10)
    }

    private static func timestamp(_ raw: String) -> String {
        let iso = Date.ISO8601FormatStyle()
        guard let date = (try? iso.parse(raw)) ?? (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(raw)) else {
            return raw
        }
        let format = Date.VerbatimFormatStyle(format: "\(year: .defaultDigits)-\(month: .twoDigits)-\(day: .twoDigits) \(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits)", timeZone: TimeZone(identifier: "Asia/Shanghai")!, calendar: Calendar(identifier: .gregorian))
        return date.formatted(format)
    }

}

struct MarkdownText: View {
    let text: String
    var body: some View {
        // Preserve paragraph breaks while using native inline Markdown for links/emphasis.
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(text.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                Text((try? AttributedString(markdown: line)) ?? AttributedString(line))
                    .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
            }
        }.lineSpacing(5)
    }
}

// Sanitized HTML becomes native attributed text, preserving paragraph links.
struct NativeReadingBlock: View {
    let block: ReadingDocument.Block
    var body: some View {
        if let html = block.html {
            if block.headingLevel != nil {
                Text(Self.render(html)).font(.title2.bold()).textSelection(.enabled).accessibilityAddTraits(.isHeader)
            } else { Text(Self.render(html)).textSelection(.enabled) }
        }
        if let url = block.imageURL {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image): image.resizable().scaledToFit()
                case .failure: Label("图片暂不可用", systemImage: "photo").foregroundStyle(.secondary)
                default: ProgressView().frame(minHeight: 100)
                }
            }.accessibilityLabel("报道配图")
        }
    }
    @MainActor private static func render(_ html: String) -> AttributedString {
        guard let data = html.data(using: .utf8),
              let native = try? NSAttributedString(data: data, options: [.documentType: NSAttributedString.DocumentType.html,
                  .characterEncoding: String.Encoding.utf8.rawValue], documentAttributes: nil) else { return AttributedString("") }
        let clean = NSMutableAttributedString(attributedString: native)
        let range = NSRange(location: 0, length: clean.length)
        for key in [NSAttributedString.Key.font, .foregroundColor, .backgroundColor] { clean.removeAttribute(key, range: range) }
        return AttributedString(clean)
    }
}
