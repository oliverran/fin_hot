package website.finhub.finhot

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement

private const val US_GROUP = "us"
val usCharts = listOf(
    ChartPage(US_GROUP, "sp500/price", "标普 500", "美国大盘股指数的每日收盘走势。", "按交易日展示标普 500 指数收盘点位。"),
    ChartPage(US_GROUP, "ndx/price", "纳斯达克 100", "纳斯达克 100 指数的每日收盘走势。", "按交易日展示纳斯达克 100 指数收盘点位。"),
    ChartPage(US_GROUP, "dow/century", "道琼斯工业平均指数", "从月度观测看道指的长期走势。", "按月展示指数点位，纵轴为线性刻度。"),
    ChartPage(US_GROUP, "sp500/annual-returns", "标普 500 年度涨跌幅", "逐年比较指数价格涨跌。", "按年展示价格涨跌幅（%），未结束的年份截至最近观测日。"),
    ChartPage(US_GROUP, "ndx/annual-returns", "纳斯达克 100 年度涨跌幅", "逐年比较指数价格涨跌。", "按年展示价格涨跌幅（%），未结束的年份截至最近观测日。")
)

@Serializable private data class UsMarketSeries(
    val series: List<Observation>, val updated: String? = null,
    @SerialName("_attribution") val attribution: String? = null
) {
    @Serializable data class Observation(val date: String, val close: Double? = null, val value: Double? = null)
}

internal fun decodeUsChart(page: ChartPage, json: JsonElement): ChartPayload {
    val data = wireJson.decodeFromJsonElement<UsMarketSeries>(json)
    val prices = page.slug.endsWith("/price")
    val type = if (page.slug.endsWith("/annual-returns")) "bar" else "line"
    val meta = ChartMeta(page.cardTitle, type, data.attribution, data.updated)
    return ChartPayload(meta, data.series.map { it.date },
        mapOf(page.cardTitle to data.series.map { if (prices) it.close else it.value }))
}

internal class MarketCharts(private val fetch: suspend (String) -> Resource, private val now: () -> Long = System::currentTimeMillis) {
    private data class Entry(val payload: ChartPayload, val deadline: Long)
    private val cache = LinkedHashMap<String, Entry>(4, 0.75f, true)

    suspend fun load(page: ChartPage): ChartPayload = withContext(Dispatchers.Default) {
        val us = page.group == US_GROUP
        val path = if (us) "us-market/api/${page.slug}.json" else "api/chronicle/${page.group}/${page.slug}.json"
        synchronized(cache) { cache[path] }?.takeIf { it.deadline > now() }?.let { return@withContext it.payload }
        val response = fetch(path)
        val chart = if (us) decodeUsChart(page, response.json) else decodeChart(response.json)
        synchronized(cache) {
            if (response.deadline > now()) {
                cache[path] = Entry(chart, response.deadline)
                if (cache.size > 4) cache.remove(cache.keys.first())
            } else cache.remove(path)
        }
        chart
    }
}
