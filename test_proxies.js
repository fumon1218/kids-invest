const targetUrl = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=203650.KQ,042510.KQ";
const url1 = "https://api.allorigins.win/get?url=" + encodeURIComponent(targetUrl);
const url2 = "https://corsproxy.io/?" + encodeURIComponent(targetUrl);

async function testProxy(name, url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log(`${name} HTTP ${res.status}`);
    console.log(`${name} Data preview: ${text.substring(0, 150)}`);
  } catch (err) {
    console.log(`${name} Error:`, err.message);
  }
}

async function run() {
  await testProxy("allorigins", url1);
  await testProxy("corsproxy", url2);
}
run();
