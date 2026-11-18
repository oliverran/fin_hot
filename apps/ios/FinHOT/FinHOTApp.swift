import SwiftUI
import FinHOTCore

@main
struct FinHOTApp: App {
    @StateObject private var app = AppState()
    var body: some Scene {
        WindowGroup {
            Group {
                if app.client == nil { ConnectionView() }
                else { MainTabs().id(app.siteText) }
            }
            .environmentObject(app)
            .tint(Color(red: 0.09, green: 0.42, blue: 0.46))
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var siteText: String
    @Published private(set) var bookmarks: BookmarkStore
    @Published private(set) var reading: ReadingState
    private(set) var client: APIClient?
    let categories: [ReadingCategory] = {
        guard let url = Bundle.main.url(forResource: "categories", withExtension: "json"), let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([ReadingCategory].self, from: data)) ?? []
    }()
    private static var localHTTP: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }
    init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "FinHOTSiteURL") as? String ?? "https://www.finhub.website"
        let selectedSite = UserDefaults.standard.string(forKey: "site") ?? configured
        siteText = selectedSite
        bookmarks = BookmarkStore(ids: UserDefaults.standard.stringArray(forKey: "bookmarks:\(selectedSite)") ?? [])
        reading = Self.loadReading(selectedSite)
        client = (try? SiteAddress(selectedSite, allowLocalHTTP: Self.localHTTP)).map { APIClient(site: $0) }
    }
    func connect(_ value: String) throws {
        let site = try SiteAddress(value, allowLocalHTTP: Self.localHTTP)
        client = APIClient(site: site)
        siteText = site.url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        UserDefaults.standard.set(siteText, forKey: "site")
        bookmarks = BookmarkStore(ids: UserDefaults.standard.stringArray(forKey: "bookmarks:\(siteText)") ?? [])
        reading = Self.loadReading(siteText)
    }
    func toggle(_ id: String) {
        bookmarks.toggle(id)
        UserDefaults.standard.set(bookmarks.ids, forKey: "bookmarks:\(siteText)")
    }
    func markRead(_ id: String) {
        reading.markRead(id)
        persistReading()
    }
    func markUnread(_ id: String) {
        reading.markUnread(id)
        persistReading()
    }
    func savePosition(_ id: String, fingerprint: String, blockID: String) {
        reading.savePosition(articleID: id, fingerprint: fingerprint, blockID: blockID)
        persistReading()
    }
    private func persistReading() {
        if let data = try? JSONEncoder().encode(reading) { UserDefaults.standard.set(data, forKey: "reading:\(siteText)") }
    }
    private static func loadReading(_ site: String) -> ReadingState {
        guard let data = UserDefaults.standard.data(forKey: "reading:\(site)"),
              let state = try? JSONDecoder().decode(ReadingState.self, from: data) else { return ReadingState() }
        return state
    }
}

struct MainTabs: View {
    var body: some View {
        TabView {
            FeedView().tabItem { Label("资讯", systemImage: "newspaper") }
            NavigationStack { HotView() }.tabItem { Label("热点", systemImage: "flame") }
            NavigationStack { ReportsView() }.tabItem { Label("简报", systemImage: "doc.text") }
            NavigationStack { ChronicleView() }.tabItem { Label("编年史", systemImage: "chart.xyaxis.line") }
            NavigationStack { MoreView() }.tabItem { Label("我的", systemImage: "person.crop.circle") }
        }
    }
}

struct ConnectionView: View {
    @EnvironmentObject private var app: AppState
    @State private var address = ""
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("FinHOT").font(.largeTitle.bold())
                    Text("值得关注的金融动态").foregroundStyle(.secondary)
                }
                Section("连接你的网站") {
                    TextField("https://你的域名", text: $address)
                        .textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("开始阅读") {
                        do { try app.connect(address) } catch { self.error = error.localizedDescription }
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                }
                Section { Text("直接阅读网站已发布的内容，无需注册。网站地址可在“我的”中更改。").font(.footnote) }
            }
            .navigationTitle("欢迎使用")
        }
    }
}
