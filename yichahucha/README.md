# Surge

Netflix ratings（IMDb、douban）
```properties
[Script]
nf_rating.js = type=http-request,pattern=^https?:\/\/ios(-.*)?\.prod\.ftl\.netflix\.com\/iosui\/user/.+path=%5B%22videos%22%2C%\d+%22%2C%22summary%22%5D,script-path=https://raw.githubusercontent.com/yichahucha/surge/master/nf_rating.js
nf_rating.js = type=http-response,requires-body=1,pattern=^https?:\/\/ios(-.*)?\.prod\.ftl\.netflix\.com\/iosui\/user/.+path=%5B%22videos%22%2C%\d+%22%2C%22summary%22%5D,script-path=https://raw.githubusercontent.com/yichahucha/surge/master/nf_rating.js
[MITM]
hostname = ios-*.prod.ftl.netflix.com,ios.prod.ftl.netflix.com
```

Wb
```properties
[Script]
http-response ^https?://(sdk|wb)app\.uve\.weibo\.com(/interface/sdk/sdkad.php|/wbapplua/wbpullad.lua) requires-body=1,script-path=https://raw.githubusercontent.com/yichahucha/surge/master/wb_launch.js
http-response ^https?://m?api\.weibo\.c(n|om)/2/(messageflow/notice|search/(container_timeline|finder)|statuses/(container_timeline_hot|container_timeline_unread|container_timeline|unread|extend|positives/get|(friends|video)(/|_)(mix)?timeline)|stories/(video_stream|home_list)|(groups|fangle)/timeline|profile/statuses|comments/build_comments|photo/recommend_list|service/picfeed|searchall|cardlist|page|!/(photos/pic_recommend_status|live/media_homelist)|video/tiny_stream_video_list|photo/info|remind/unread_count) requires-body=1,max-size=-1,script-path=https://raw.githubusercontent.com/yichahucha/surge/master/wb_ad.js
[MITM]
hostname = api.weibo.cn, mapi.weibo.com, *.uve.weibo.com
```

~~Display jd historical price~~
```properties
[Script]
http-response ^https?://api\.m\.jd\.com/client\.action\?functionId=(wareBusiness|serverConfig|basicConfig) requires-body=1,script-path=https://raw.githubusercontent.com/yichahucha/surge/master/jd_price.js
[MITM]
hostname = api.m.jd.com
```

~~Display taobao historical price~~
```properties
[Script]
http-response ^http://.+/amdc/mobileDispatch requires-body=1,script-path=https://raw.githubusercontent.com/yichahucha/surge/master/tb_price.js
http-response ^https?://trade-acs\.m\.taobao\.com/gw/mtop\.taobao\.detail\.getdetail requires-body=1,script-path=https://raw.githubusercontent.com/yichahucha/surge/master/tb_price.js
[MITM]
hostname = trade-acs.m.taobao.com
```

# Quan-X

Netflix ratings（IMDb、douban）
```properties
[rewrite_local]
^https?://ios(-.*)?\.prod\.ftl\.netflix\.com/iosui/user/.+path=%5B%22videos%22%2C%\d+%22%2C%22summary%22%5D url script-request-header https://raw.githubusercontent.com/yichahucha/surge/master/nf_rating.js
^https?://ios(-.*)?\.prod\.ftl\.netflix\.com/iosui/user/.+path=%5B%22videos%22%2C%\d+%22%2C%22summary%22%5D url script-response-body https://raw.githubusercontent.com/yichahucha/surge/master/nf_rating.js
[mitm]
hostname = ios-*.prod.ftl.netflix.com,ios.prod.ftl.netflix.com
```

Wb
```properties
[rewrite_local]
^https?://(sdk|wb)app\.uve\.weibo\.com(/interface/sdk/sdkad.php|/wbapplua/wbpullad.lua) url script-response-body https://raw.githubusercontent.com/yichahucha/surge/master/wb_launch.js
^https?://m?api\.weibo\.c(n|om)/2/(messageflow/notice|search/(container_timeline|finder)|statuses/(container_timeline_hot|container_timeline_unread|container_timeline|unread|extend|positives/get|(friends|video)(/|_)(mix)?timeline)|stories/(video_stream|home_list)|(groups|fangle)/timeline|profile/statuses|comments/build_comments|photo/recommend_list|service/picfeed|searchall|cardlist|page|!/(photos/pic_recommend_status|live/media_homelist)|video/tiny_stream_video_list|photo/info|remind/unread_count) url script-response-body https://raw.githubusercontent.com/yichahucha/surge/master/wb_ad.js
[mitm]
hostname = api.weibo.cn, mapi.weibo.com, *.uve.weibo.com
```

~~Display jd historical price~~
```properties
[rewrite_local]
^https?://api\.m\.jd\.com/client\.action\?functionId=(wareBusiness|serverConfig|basicConfig) url script-response-body https://raw.githubusercontent.com/yichahucha/surge/master/jd_price.js
[mitm]
hostname = api.m.jd.com
```

~~Display taobao historical price~~
```properties
[rewrite_local]
^http://.+/amdc/mobileDispatch url script-response-body https://raw.githubusercontent.com/yichahucha/surge/master/tb_price.js
^https?://trade-acs\.m\.taobao\.com/gw/mtop\.taobao\.detail\.getdetail url script-response-body https://raw.githubusercontent.com/yichahucha/surge/master/tb_price.js
[mitm]
hostname = trade-acs.m.taobao.com
```
