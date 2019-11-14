import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// Options
export let options = {
    stages: [
        { target: 100, duration: "30s" },
        { target: 100, duration: "120s" },
        { target: 120, duration: "60s" },
        { target: 0, duration: "30s" }
    ],
    thresholds: {
        "http_req_duration": ["p(95)<500"],
        "http_req_duration": ["p(99)<10"],
        "http_req_duration{staticAsset:yes}": ["p(95)<100"],
        "check_failure_rate": ["rate<0.3"]
    },
    ext: {
        loadimpact: {
            name: "Demo",
            distribution: {
                label1: { loadZone: "amazon:us:ashburn", percent: 50 },
                label2: { loadZone: "amazon:ie:dublin", percent: 50 }
            }
        }
    }
};

// Custom metrics
var successfulLogins = new Counter("successful_logins");
var checkFailureRate = new Rate("check_failure_rate");
var timeToFirstByte = new Trend("time_to_first_byte", true);

// Main functon
export default function() {
    group("Front page", function() {
        let res = null;
        var baseURL = "http://test.loadimpact.com/";
        if (__ENV.ACTIVATE_PERF_ALERT_MANY_URLS) {
            res = http.get(baseURL + "?ts=" + Math.random());
        } else {
            res = http.get(baseURL);
        }
        let checkRes = check(res, {
            "status is 200": (r) => r.status === 200,
            "body is 1176 bytes": (r) => r.body.length === 1176,
            "is welcome header present": (r) => r.body.indexOf("Welcome to the LoadImpact.com demo site!") !== -1
        });

        // Record check failures
        checkFailureRate.add(!checkRes);

        // Record time to first byte and tag it with the URL to be able to filter the results in Insights
        timeToFirstByte.add(res.timings.waiting, { url: res.url });

        // Load static assets
        group("Static assets", function() {
            let res = http.batch([
                ["GET", "http://test.loadimpact.com/style.css", {}, { tags: { staticAsset: "yes" } }],
                ["GET", "http://test.loadimpact.com/style_404.css", {}, { tags: { staticAsset: "yes" } }],
                ["GET", "http://test.loadimpact.com/images/logo.png", {}, { tags: { staticAsset: "yes" } }]
            ]);
            checkRes = check(res[0], {
                "is status 200": (r) => r.status === 200
            });

            // Record check failures
            checkFailureRate.add(!checkRes);

            // Record time to first byte and tag it with the URL to be able to filter the results in Insights
            timeToFirstByte.add(res[0].timings.waiting, { url: res[0].url, staticAsset: "yes" });
            timeToFirstByte.add(res[1].timings.waiting, { url: res[1].url, staticAsset: "yes" });
        });

        sleep(5);
    });

    group("Login", function() {
        let res = http.get("http://test.loadimpact.com/my_messages.php");
        let checkRes = check(res, {
            "is status 200": (r) => r.status === 200,
            "is unauthorized header present": (r) => r.body.indexOf("Unauthorized") !== -1
        });

        // Record check failures
        checkFailureRate.add(!checkRes);

        res = http.post("http://test.loadimpact.com/login.php", { login: 'admin', password: '123', redir: '1' });
        checkRes = check(res, {
            "is status 200": (r) => r.status === 200,
            "is welcome header present": (r) => r.body.indexOf("Welcome, admin!") !== -1
        });

        // Record successful logins
        if (checkRes) {
            successfulLogins.add(1);
        }

        // Record check failures
        checkFailureRate.add(!checkRes, { page: "login" });

        // Record time to first byte and tag it with the URL to be able to filter the results in Insights
        timeToFirstByte.add(res.timings.waiting, { url: res.url });

        sleep(3);
    });
}
