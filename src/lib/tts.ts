export const isTTSSupported = (): boolean => "speechSynthesis" in window;

export function speak(text: string, lang = "de-DE"): void {
  if (!isTTSSupported()) return;
  try {
    window.speechSynthesis.cancel(); // stop any current speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85; // slightly slower for language learners
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis error:", err);
  }
}
