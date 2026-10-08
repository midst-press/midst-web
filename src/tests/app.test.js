const puppeteer = require('puppeteer')
const assert = require('assert')

describe('General tests', () => {
  it('works', async () => {
    const browser = await puppeteer.launch({ headless: true })
    const page = await browser.newPage()

    await page.goto('http://localhost:1234')
    await page.waitForSelector('.hem-application')

    assert.ok(true)

    await browser.close()
  })
})
