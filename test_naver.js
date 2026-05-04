async function testNaver(code) {
  const url = `https://api.allorigins.win/get?url=${encodeURIComponent('https://m.stock.naver.com/api/stock/' + code + '/integration')}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const contents = JSON.parse(data.contents);
    console.log(code, contents.closePrice, contents.compareToPreviousClosePrice, contents.fluctuationsRatio);
  } catch (err) {
    console.error(err);
  }
}
testNaver('203650');
testNaver('042510');
