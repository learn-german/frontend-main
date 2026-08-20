import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTicketStats,
  filterTickets,
  mapMessage,
  mapTicket,
  type MessageRow,
  type TicketRow,
} from "./supportMappers";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-20T00:00:00Z").getTime();

const ticketRow: TicketRow = {
  id: "t1",
  code: "SD-1000",
  user_id: "u1",
  title: "Không mở được bài nghe",
  topic: "lesson_content",
  status: "pending",
  created_at: "2026-08-18T09:12:00Z",
  updated_at: "2026-08-18T09:12:00Z",
};

const at = (ms: number) => new Date(ms).toISOString();

// ---------------------------------------------------------------- mapTicket

test("TS-01 mapTicket đổi snake_case sang camelCase", () => {
  const t = mapTicket(ticketRow);
  assert.equal(t.id, "t1");
  assert.equal(t.code, "SD-1000");
  assert.equal(t.userId, "u1");
  assert.equal(t.title, "Không mở được bài nghe");
  assert.equal(t.topic, "lesson_content");
  assert.equal(t.status, "pending");
  assert.equal(t.createdAt, "2026-08-18T09:12:00Z");
  assert.equal(t.updatedAt, "2026-08-18T09:12:00Z");
});

test("TS-02 mapTicket trả author null khi không nhúng profiles", () => {
  assert.equal(mapTicket(ticketRow).author, null);
});

test("TS-03 mapTicket trả author null khi nhúng profiles nhưng không có row", () => {
  assert.equal(mapTicket({ ...ticketRow, profiles: null }).author, null);
});

test("TS-04 mapTicket lấy email và tên khi có nhúng profiles", () => {
  const t = mapTicket({
    ...ticketRow,
    profiles: { email: "minhanh@example.com", full_name: "Nguyễn Minh Anh" },
  });
  assert.deepEqual(t.author, {
    email: "minhanh@example.com",
    fullName: "Nguyễn Minh Anh",
  });
});

test("TS-05 mapTicket giữ author khác null khi học viên chưa đặt tên", () => {
  const t = mapTicket({
    ...ticketRow,
    profiles: { email: "a@b.c", full_name: null },
  });
  assert.notEqual(t.author, null, "có email thì author không được là null");
  assert.equal(t.author?.fullName, null);
  assert.equal(t.author?.email, "a@b.c");
});

// --------------------------------------------------------------- mapMessage

test("TS-06 mapMessage đổi snake_case sang camelCase", () => {
  const row: MessageRow = {
    id: "m1",
    ticket_id: "t1",
    author_id: "u1",
    is_staff: false,
    body: "Bài nghe không phát được.",
    created_at: "2026-08-18T09:12:00Z",
  };
  assert.deepEqual(mapMessage(row), {
    id: "m1",
    ticketId: "t1",
    authorId: "u1",
    isStaff: false,
    body: "Bài nghe không phát được.",
    createdAt: "2026-08-18T09:12:00Z",
  });
});

test("TS-07 mapMessage giữ nguyên is_staff true", () => {
  const row: MessageRow = {
    id: "m2", ticket_id: "t1", author_id: "admin1", is_staff: true,
    body: "Đã sửa.", created_at: "2026-08-18T09:35:00Z",
  };
  assert.equal(mapMessage(row).isStaff, true);
});

// -------------------------------------------------------- computeTicketStats

test("TS-08 computeTicketStats trả 0 cho danh sách rỗng", () => {
  assert.deepEqual(computeTicketStats([], NOW), {
    pending: 0, processing: 0, resolvedThisWeek: 0,
  });
});

test("TS-09 computeTicketStats đếm đúng từng trạng thái", () => {
  const tickets = [
    mapTicket({ ...ticketRow, id: "a", status: "pending" }),
    mapTicket({ ...ticketRow, id: "b", status: "pending" }),
    mapTicket({ ...ticketRow, id: "c", status: "processing" }),
    mapTicket({ ...ticketRow, id: "d", status: "resolved", updated_at: at(NOW) }),
  ];
  const s = computeTicketStats(tickets, NOW);
  assert.equal(s.pending, 2);
  assert.equal(s.processing, 1);
  assert.equal(s.resolvedThisWeek, 1);
});

test("TS-10 computeTicketStats: resolved đúng mốc 7 ngày vẫn được tính", () => {
  const tickets = [
    mapTicket({ ...ticketRow, status: "resolved", updated_at: at(NOW - WEEK_MS) }),
  ];
  assert.equal(computeTicketStats(tickets, NOW).resolvedThisWeek, 1);
});

test("TS-11 computeTicketStats: resolved sớm hơn mốc 1ms thì không tính", () => {
  const tickets = [
    mapTicket({ ...ticketRow, status: "resolved", updated_at: at(NOW - WEEK_MS - 1) }),
  ];
  assert.equal(computeTicketStats(tickets, NOW).resolvedThisWeek, 0);
});

test("TS-12 computeTicketStats không tính pending/processing cũ vào thẻ tuần", () => {
  const tickets = [
    mapTicket({ ...ticketRow, status: "pending", updated_at: at(NOW - 90 * 86400000) }),
    mapTicket({ ...ticketRow, status: "processing", updated_at: at(NOW - 90 * 86400000) }),
  ];
  const s = computeTicketStats(tickets, NOW);
  assert.equal(s.resolvedThisWeek, 0);
  assert.equal(s.pending, 1, "ticket cũ vẫn phải đếm vào thẻ đang chờ");
});

// ------------------------------------------------------------- filterTickets

const list = [
  mapTicket({ ...ticketRow, id: "a", code: "SD-1000", title: "Không mở được bài nghe", status: "pending" }),
  mapTicket({ ...ticketRow, id: "b", code: "SD-2000", title: "Sai đáp án Grammatik", status: "processing" }),
  mapTicket({ ...ticketRow, id: "c", code: "SD-3000", title: "Không đăng nhập được", status: "resolved" }),
];

test("TS-13 filterTickets không lọc gì khi search rỗng và status all", () => {
  assert.equal(filterTickets(list, "", "all", "all").length, 3);
});

test("TS-14 filterTickets khớp mã không phân biệt hoa thường", () => {
  assert.equal(filterTickets(list, "sd-2000", "all", "all")[0].id, "b");
  assert.equal(filterTickets(list, "SD-2000", "all", "all")[0].id, "b");
});

test("TS-15 filterTickets khớp tiêu đề có dấu, không phân biệt hoa thường", () => {
  assert.equal(filterTickets(list, "ĐÁP ÁN", "all", "all")[0].id, "b");
  assert.equal(filterTickets(list, "đáp án", "all", "all")[0].id, "b");
});

test("TS-16 filterTickets bỏ khoảng trắng thừa quanh từ khoá", () => {
  assert.equal(filterTickets(list, "   sd-3000   ", "all", "all")[0].id, "c");
});

test("TS-17 filterTickets trả rỗng khi không khớp gì", () => {
  assert.deepEqual(filterTickets(list, "không tồn tại xyz", "all", "all"), []);
});

test("TS-18 filterTickets lọc theo trạng thái", () => {
  assert.equal(filterTickets(list, "", "pending", "all").length, 1);
  assert.equal(filterTickets(list, "", "processing", "all").length, 1);
  assert.equal(filterTickets(list, "", "resolved", "all").length, 1);
});

test("TS-19 filterTickets áp đồng thời cả từ khoá lẫn trạng thái", () => {
  assert.equal(filterTickets(list, "không", "pending", "all").length, 1,
    "hai ticket chứa chữ 'không' nhưng chỉ một ticket pending");
  assert.equal(filterTickets(list, "không", "resolved", "all").length, 1);
  assert.equal(filterTickets(list, "sd-1000", "resolved", "all").length, 0);
});

test("TS-20 filterTickets không sửa mảng gốc", () => {
  const before = [...list];
  filterTickets(list, "sd-1000", "pending", "all");
  assert.deepEqual(list, before);
});

// -------------------------------------------------------- filterTickets (topic)

const topicList = [
  mapTicket({ ...ticketRow, id: "a", code: "SD-1000", title: "Không mở được bài nghe", topic: "lesson_content", status: "pending" }),
  mapTicket({ ...ticketRow, id: "b", code: "SD-2000", title: "Trang web bị lỗi", topic: "website_issue", status: "processing" }),
  mapTicket({ ...ticketRow, id: "c", code: "SD-3000", title: "Không đăng nhập được", topic: "account_access", status: "resolved" }),
];

test("TS-21 filterTickets lọc đúng một chủ đề", () => {
  const result = filterTickets(topicList, "", "all", "website_issue");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b");
});

test("TS-22 filterTickets topic 'all' cho toàn bộ danh sách đi qua", () => {
  assert.equal(filterTickets(topicList, "", "all", "all").length, 3);
});

test("TS-23 filterTickets kết hợp chủ đề với trạng thái và từ khoá", () => {
  assert.equal(filterTickets(topicList, "không", "resolved", "account_access").length, 1,
    "khớp cả ba điều kiện thì phải ra đúng ticket c");
  assert.equal(filterTickets(topicList, "không", "resolved", "account_access")[0].id, "c");
  // Đúng trạng thái + từ khoá nhưng sai chủ đề -> rỗng.
  assert.equal(filterTickets(topicList, "không", "resolved", "website_issue").length, 0);
  // Đúng chủ đề + trạng thái nhưng sai từ khoá -> rỗng.
  assert.equal(filterTickets(topicList, "trang web", "resolved", "account_access").length, 0);
});

test("TS-24 filterTickets trả rỗng khi không ticket nào khớp chủ đề", () => {
  assert.deepEqual(filterTickets(topicList, "", "all", "exercise_feedback"), []);
});
