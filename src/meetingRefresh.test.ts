import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const meetingPageSource = readFileSync(
  new URL("./pages/MeetingPage.tsx", import.meta.url),
  "utf8",
);

test("App refreshes the weekly teaser when meetings change", () => {
  assert.match(
    appSource,
    /const \[meetingRefreshKey, setMeetingRefreshKey\] = useState\(0\);/,
  );
  assert.match(appSource, /\}, \[user\?\.id, meetingRefreshKey\]\);/);
  assert.match(
    appSource,
    /<MeetingPage onMeetingsChanged=\{\(\) => setMeetingRefreshKey\(\(key\) => key \+ 1\)\} \/>/,
  );
});

test("MeetingPage notifies App after successful register and cancel", () => {
  const registerHandler = meetingPageSource.slice(
    meetingPageSource.indexOf("const handleRegister"),
    meetingPageSource.indexOf("const handleCancel"),
  );
  const cancelHandler = meetingPageSource.slice(
    meetingPageSource.indexOf("const handleCancel"),
    meetingPageSource.indexOf("\n\n  if (loading)"),
  );

  assert.match(registerHandler, /await registerMeeting\(sessionId\);[\s\S]*onMeetingsChanged\(\);/);
  assert.match(cancelHandler, /await cancelMeeting\(sessionId\);[\s\S]*onMeetingsChanged\(\);/);
});
