import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { startHarnessServer, type Harness } from "./classification-fields/server.ts";

let harness: Harness;
let browser: Browser;
let page: Page;

test.before(async () => {
  harness = await startHarnessServer();
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(harness.url);
});

test.after(async () => {
  await browser.close();
  await harness.close();
});

test("ô nhập nội dung item đủ rộng để đọc được chữ đã gõ", async () => {
  const itemInput = page.getByPlaceholder("Tisch");
  const groupSelect = page.locator("select");

  const itemBox = await itemInput.boundingBox();
  const selectBox = await groupSelect.boundingBox();

  assert.ok(itemBox, "ô nhập item phải render ra được");
  assert.ok(selectBox, "dropdown chọn nhóm phải render ra được");
  // Bug hiện tại: input ~26px (bị bóp về 0 nội dung), select ~450px+
  // (thừa hưởng w-full, chiếm gần hết dòng). Ngưỡng dưới đây thất bại với
  // bug và sẽ pass sau khi Task 2 tách inputBaseCls.
  assert.ok(
    itemBox!.width > 150,
    `ô nhập item phải rộng hơn 150px, đang là ${itemBox!.width}px`,
  );
  assert.ok(
    selectBox!.width < 150,
    `dropdown phải hẹp hơn 150px (khoảng 112px), đang là ${selectBox!.width}px`,
  );
});

test("gõ được nội dung vào ô item và đọc lại đúng giá trị", async () => {
  const itemInput = page.getByPlaceholder("Tisch");
  await itemInput.fill("Tisch");
  assert.equal(await itemInput.inputValue(), "Tisch");
});
