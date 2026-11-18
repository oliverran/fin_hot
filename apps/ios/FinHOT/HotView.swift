import SwiftUI
import FinHOTCore

struct HotView: View {
    @EnvironmentObject private var app: AppState
    var body: some View {
        RemoteView(load: { () async throws -> HotResponse in try await app.client!.hotTopics() }) { hot in
            List {
                Section { Text("多个来源，同一件事").font(.title3.bold()); Text("按网站热度排行，追踪事件进展与报道来源。").font(.subheadline).foregroundStyle(.secondary) }
                ForEach(hot.entries) { entry in
                    NavigationLink { StoryView(id: entry.id) } label: {
                        HStack(alignment: .top, spacing: 16) {
                            Text(String(format: "%02d", entry.rank)).font(.title2.monospacedDigit().bold()).foregroundStyle(.tint)
                            VStack(alignment: .leading, spacing: 8) {
                                Text(entry.story.title).font(.headline)
                                Text("\(entry.sourceCount) 个报道来源").font(.caption).foregroundStyle(.secondary)
                            }
                        }.padding(.vertical, 10)
                    }
                }
                if hot.entries.isEmpty { ContentUnavailableView("暂无热点", systemImage: "flame") }
            }.listStyle(.plain)
        }.navigationTitle("热点事件")
    }
}
struct StoryView: View {
    let id: String
    @EnvironmentObject private var app: AppState
    var body: some View {
        RemoteView(load: { () async throws -> StoryDetail in try await app.client!.story(id: id) }) { story in
            List {
                Section {
                    Text(story.title).font(.title.bold())
                    Text("\(story.sourceCount) 个来源 · \(story.reportCount) 篇报道").font(.caption).foregroundStyle(.secondary)
                    if let text = story.digest ?? story.summary { MarkdownText(text: text) }
                }
                Section("报道时间线") {
                    ForEach(story.timeline) { report in
                        NavigationLink { ArticleView(id: report.id) } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(report.title).font(.headline)
                                Text("\(report.source.name) · \(report.publishedAt.prefix(10))").font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 6)
                        }
                    }
                }
            }.listStyle(.plain)
        }.navigationTitle("事件追踪").navigationBarTitleDisplayMode(.inline)
            .toolbar { ShareLink(item: app.client!.site.page("story/\(id)")) }
    }
}
