package website.finhub.finhot

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.Assert.*
import org.junit.Test

class ReadingTests {
    @Test fun bookmarksKeepSaveOrderAfterRestart() {
        val value = Library().toggleBookmark("z").toggleBookmark("a")
        val restored = wireJson.decodeFromString<Library>(wireJson.encodeToString(value))
        assertEquals(listOf("a", "z"), restored.bookmarks)
        assertEquals(listOf("z"), restored.toggleBookmark("a").bookmarks)
    }
    @Test fun readAndUnreadPreserveIndependentBookmarks() {
        val state = Library().toggleBookmark("a").markRead("a").savePosition("a", "body-v1", "body-3")
        val restored = wireJson.decodeFromString<Library>(wireJson.encodeToString(state))
        assertEquals("body-3", restored.positions["a"]?.blockID)
        val unread = restored.markUnread("a")
        assertTrue(unread.readIDs.isEmpty())
        assertFalse(unread.positions.containsKey("a"))
        assertEquals(listOf("a"), unread.bookmarks)
    }
    @Test fun readingOrderHasNoDuplicateIDs() {
        val value = Library().markRead("a").markRead("b").markRead("a")
        assertEquals(listOf("a", "b"), value.readIDs)
    }
    private fun page(vararg records: Pair<String, String>, next: String? = null): ItemsPage = ItemsPage(1,
        records.map { Article(it.first, it.second, Source("测试来源")) }, Page(next != null, next))
    @Test fun paginationUpdatesDuplicateWithoutReorderingOrRenewingOldPage() {
        val feed = FeedWindow().append(page("a" to "旧标题", "b" to "第二条", next = "opaque+/="), 100)
            .append(page("a" to "更正标题", "c" to "第三条"), 200)
        assertEquals(listOf("a", "b", "c"), feed.items.map { it.id })
        assertEquals("更正标题", feed.items[0].title)
        assertEquals(100L, feed.validUntil)
        assertFalse(feed.hasMore)
        assertNull(FeedWindow().cursor)
    }
    @Test fun returnAfterReadOrWithdrawalFindsNearbyVisibleArticle() {
        val original = listOf("a", "b", "c", "d")
        assertEquals("b", restoredAnchor("b", original, original))
        assertEquals("c", restoredAnchor("b", original, listOf("a", "c", "d")))
        assertEquals("c", restoredAnchor("d", original, listOf("a", "c")))
        assertNull(restoredAnchor("a", original, emptyList()))
    }
    @Test fun publicItemContractAllowsNullDatesAndExtraFields() {
        val article = wireJson.decodeFromString<Article>("""{"id":"a","title":"央行公告","source":{"name":"央行"},"selected":true,"publishedAt":null,"attribution":{"name":"FinHOT"}}""")
        assertNull(article.publishedAt)
        assertEquals("央行", article.source.name)
    }
    @Test fun hotNavigationUsesStoryLinkInsteadOfRepresentativeArticleID() {
        val representative = "article-1"
        val id = routeID("https://www.finhub.website/story/89d6c77b-ff94-427e-89aa-264acc927d4e", "/story/")
        assertNotEquals(representative, id)
        assertEquals("89d6c77b-ff94-427e-89aa-264acc927d4e", id)
        assertNull(routeID("https://www.finhub.website/story/../../admin", "/story/"))
    }
    @Test fun threeReportKindsUseTheirOwnCalendarKeys() {
        assertEquals("2026-11-17", Issue(date = "2026-11-17").key(ReportKind.DAILY))
        assertEquals("2026-W46", Issue(week = "2026-W46").key(ReportKind.WEEKLY))
        assertEquals("2026-10", Issue(month = "2026-10").key(ReportKind.MONTHLY))
    }
    @Test fun nativeParagraphsKeepTextOnBothSidesOfAnImage() {
        val item = ArticleDetail("a", "标题", Source("来源"), Links("https://example.com"), "full",
            body = ArticleBody(zh = "<h2>章节</h2><p>前文<img src='/image.png'>后文<a href='https://example.com'>链接</a></p>"))
        val document = ReadingDocument(item, "https://www.finhub.website")
        assertEquals(4, document.blocks.size)
        assertTrue(document.blocks[1].html!!.contains("前文"))
        assertEquals("https://www.finhub.website/image.png", document.blocks[2].imageURL)
        assertTrue(document.blocks[3].html!!.contains("后文"))
        assertTrue(document.blocks[3].html!!.contains("href="))
    }
    @Test fun revokedFullTextInvalidatesProgressAndContainsNoBody() {
        val item = ArticleDetail("a", "标题", Source("来源"), Links("https://example.com"), "full", body = ArticleBody(zh = "<p>正文</p>"))
        val full = ReadingDocument(item, "https://www.finhub.website")
        val revoked = ReadingDocument(item.copy(readingMode = "summary-only"), "https://www.finhub.website")
        assertNotEquals(full.fingerprint, revoked.fingerprint)
        assertTrue(revoked.blocks.isEmpty())
    }
    @Test fun timestampsUseSiteTimezoneAcrossMidnight() {
        assertEquals("2026-11-17 00:00", displayDate("2026-11-16T16:00:00.000Z"))
        assertEquals("2026-11-16 23:59", displayDate("2026-11-16T15:59:00Z"))
        assertEquals("时间未标注", displayDate(null))
    }

}
