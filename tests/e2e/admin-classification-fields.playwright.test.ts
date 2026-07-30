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

  // Bảo vệ giả định cốt lõi của harness: các phép đo chiều rộng dưới đây chỉ
  // có ý nghĩa nếu Tailwind CSS thực sự được Vite nạp. Nếu `root` của dev
  // server (xem server.ts) bị cấu hình sai, Tailwind không sinh CSS nào và
  // input/select render theo kích thước mặc định của trình duyệt — vốn cũng
  // tình cờ thỏa mãn ngưỡng bên dưới, khiến test pass giả mà không đo được gì.
  // `rounded-xl` (trong inputBaseCls) chỉ có tác dụng khi Tailwind đã nạp.
  const radius = await itemInput.evaluate((el) => getComputedStyle(el).borderRadius);
  assert.notEqual(radius, "0px", "CSS Tailwind phải được nạp — nếu không, phép đo chiều rộng vô nghĩa");

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
  // select dùng w-28 (112px) — siết khoảng hẹp quanh giá trị thật thay vì chỉ
  // "< 150" (ngưỡng cũ quá lỏng, thỏa mãn cả bởi select không style gì).
  assert.ok(
    selectBox!.width >= 100 && selectBox!.width <= 120,
    `dropdown phải rộng khoảng 112px (w-28), đang là ${selectBox!.width}px`,
  );
});

test("gõ được nội dung vào ô item và đọc lại đúng giá trị", async () => {
  const itemInput = page.getByPlaceholder("Tisch");
  await itemInput.fill("Tisch");
  assert.equal(await itemInput.inputValue(), "Tisch");
});

test("mọi nút trong khối phân loại có type=\"button\"", async () => {
  const buttonTypes = await page.locator("button").evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("type")),
  );
  // Nếu mảng rỗng (ví dụ khối phân loại không render do đổi seed data),
  // vòng lặp for bên dưới không chạy lần nào và test pass giả. Chốt số
  // lượng nút tối thiểu để đảm bảo thực sự có kiểm tra diễn ra.
  assert.ok(
    buttonTypes.length >= 4,
    `phải render ít nhất 4 nút (xoá nhóm, thêm nhóm, xoá item, thêm item), đang có ${buttonTypes.length}`,
  );
  for (const type of buttonTypes) {
    assert.equal(type, "button", "mỗi nút trong khối phân loại phải khai báo type=\"button\"");
  }
});
