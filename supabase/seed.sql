-- =============================================================================
-- DeutschPath — Seed Data
-- Chạy: npx supabase db seed  hoặc paste vào Supabase SQL Editor
-- =============================================================================

-- ---------------------------------------------------------------------------
-- modules
-- ---------------------------------------------------------------------------
INSERT INTO modules (id, level, title, title_vi, order_index) VALUES
  ('m-a1-1', 'A1', 'Einführung & Begrüßung',        'Nhập môn & Chào hỏi',                    1),
  ('m-a2-1', 'A2', 'Alltag & Freizeit im Ausland',  'Đời sống & Giải trí ở nước ngoài',       2),
  ('m-b1-1', 'B1', 'Akademisch & Berufswelt',        'Học thuật & Môi trường Công sở',         3)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- lessons  (vocabulary & grammar stored as JSONB)
-- ---------------------------------------------------------------------------
INSERT INTO lessons (id, module_id, level, title, title_vi, objective, summary, duration, order_index, xp_reward, vocabulary, grammar) VALUES
(
  'a1-l1', 'm-a1-1', 'A1',
  'Sich vorstellen und Begrüßen',
  'Chào hỏi và Giới thiệu bản thân',
  'Học cách chào hỏi cơ bản, giới thiệu tên, tuổi, quê quán bằng tiếng Đức và sử dụng nhuần nhuyễn các ngôi nhân xưng chính.',
  'Trong bài học này, chúng ta sẽ làm quen với các câu chào xã giao phổ biến nhất trong tiếng Đức như ''Guten Tag'', ''Hallo'' và cách tự giới thiệu bản thân một cách tự nhiên. Bạn sẽ học được cấu trúc hỏi tên người khác và trả lời trang trọng hoặc thân mật.',
  '05:40', 1, 15,
  $json$[
    {"de":"Guten Tag","pronunciation":"[''gu:ten ta:k]","vi":"Chào ngày mới / Xin chào (ban ngày)","exampleDe":"Guten Tag, wie geht es Ihnen?","exampleVi":"Xin chào, ngài khỏe không?"},
    {"de":"Wie heißt du?","pronunciation":"[vi: haɪst du:]","vi":"Bạn tên là gì?","exampleDe":"Hallo, ich bin Minh. Wie heißt du?","exampleVi":"Chào bạn, mình là Minh. Bạn tên là gì?"},
    {"de":"Ich komme aus...","pronunciation":"[ɪç ''kɔmə aʊs]","vi":"Tôi đến từ...","exampleDe":"Ich komme aus Vietnam.","exampleVi":"Tôi đến từ Việt Nam."},
    {"de":"Freut mich","pronunciation":"[frɔɪt mɪç]","vi":"Rất vui được làm quen","exampleDe":"Mein Name ist Thomas. - Freut mich!","exampleVi":"Tên tôi là Thomas. - Rất vui được làm quen!"},
    {"de":"Auf Wiedersehen","pronunciation":"[''aʊf ''vi:dɐ,ze:ən]","vi":"Tạm biệt (lịch sự)","exampleDe":"Auf Wiedersehen, Frau Schmidt!","exampleVi":"Xin tạm biệt bà Schmidt!"}
  ]$json$::jsonb,
  $json${"title":"Động từ ''heißen'' (tên là) & Cách chia động từ ở hiện tại","rule":"Trong tiếng Đức, động từ thay đổi đuôi tùy thuộc vào chủ ngữ (ngôi). Hãy chú ý quy tắc chia động từ cơ bản với động từ ''heißen'' (nhóm động từ có đuôi đặc biệt): \n- Ich (tôi) -> heiße (đuôi -e)\n- Du (bạn) -> heißt (đuôi -t do có âm ''ß'')\n- Er/Sie (anh ấy/cô ấy) -> heißt (đuôi -t)\n- Wir / Sie (chúng tôi / Ngài) -> heißen (đuôi -en).","examples":[{"de":"Ich heiße Lam.","vi":"Tôi tên là Lâm."},{"de":"Wie heißen Sie?","vi":"Ngài tên là gì? (Trang trọng)"},{"de":"Er heißt Maximilian.","vi":"Anh ấy tên là Maximilian."}]}$json$::jsonb
),
(
  'a1-l2', 'm-a1-1', 'A1',
  'Das deutsche Alphabet & Zahlen',
  'Bảng chữ cái & Số đếm cơ bản',
  'Nắm vững cách phát âm 26 chữ cái cơ bản, 4 ký tự đặc biệt (ä, ö, ü, ß) và hệ thống số đếm từ 0 đến 20.',
  'Bảng chữ cái viết tương đồng tiếng Anh nhưng cách đọc hoàn chỉnh lại mang âm hưởng đặc trưng. Thêm vào đó, tiếng Đức có các nguyên âm biến đổi Umlaut (ä, ö, ü) cần đặc biệt chú ý khẩu hình. Bạn cũng sẽ học cách đếm tiền xu hoặc đọc số điện thoại đơn giản.',
  '04:50', 2, 15,
  $json$[
    {"de":"die Zahlen","pronunciation":"[di: ''tsa:lən]","vi":"Các con số / Số đếm","exampleDe":"Lernen wir heute die Zahlen von eins bis zehn.","exampleVi":"Hôm nay chúng ta cùng học các con số từ một đến mười."},
    {"de":"eins","pronunciation":"[aɪns]","vi":"số 1","exampleDe":"Eins, zwei, drei!","exampleVi":"Một, hai, ba!"},
    {"de":"tschüss","pronunciation":"[tʃʏs]","vi":"Chào tạm biệt (thông dụng, thân mật)","exampleDe":"Tschüss, bis morgen!","exampleVi":"Tạm biệt nhé, hẹn gặp lại ngày mai!"},
    {"de":"Wie ist Ihre Telefonnummer?","pronunciation":"[vi: ɪst ''i:rə tele''fo:n''nʊmɐ]","vi":"Số điện thoại của Ngài là gì?","exampleDe":"Wie ist Ihre Telefonnummer, Herr Koch?","exampleVi":"Số điện thoại của Ngài là gì vậy, ông Koch?"}
  ]$json$::jsonb,
  $json${"title":"Các ký tự đặc biệt Ä, Ö, Ü, ß và quy tắc phát âm","rule":"- Ä / ä: Đọc giống âm ''e'' hoặc ''ê'' trong tiếng Việt. \n- Ö / ö: Tròn môi chữ ''O'' nhưng phát âm chữ ''Ê''.\n- Ü / ü: Tròn môi chữ ''U'' nhưng phát âm chữ ''I''.\n- ß (Eszett): Đọc như âm ''s'' kéo dài (không có trong chữ cái viết hoa đầu câu, viết tương đương ''ss'').","examples":[{"de":"schön","vi":"Đẹp / Tuyệt vời (phát âm ö)"},{"de":"Mädchen","vi":"Cô bé (phát âm ä)"},{"de":"tschüss","vi":"Tạm biệt (phát âm ü)"}]}$json$::jsonb
),
(
  'a2-l1', 'm-a2-1', 'A2',
  'Einkaufen im Supermarkt',
  'Mua sắm trong siêu thị',
  'Sử dụng mẫu câu đàm thoại khi mua thực phẩm, hỏi giá cả, cân nặng, hỏi phương thức thanh toán thẻ và tiền mặt tại Đức.',
  'Mua sắm tại Đức đòi hỏi bạn nhạy bén với cấu trúc danh từ số nhiều và các đơn vị tiền tệ. Bài học này mô phỏng chân thực một buổi đi siêu thị mua táo, sữa, bánh mì, cách trả lời khi thu ngân hỏi về hóa đơn hay túi đựng.',
  '06:15', 1, 15,
  $json$[
    {"de":"der Supermarkt","pronunciation":"[''zu:pɐ,maːkt]","vi":"Siêu thị","exampleDe":"Ich gehe in den Supermarkt, um Milch zu kaufen.","exampleVi":"Tôi đi vào siêu thị để mua sữa."},
    {"de":"Wie viel kostet das?","pronunciation":"[vi: vi:l ''kɔstət das]","vi":"Cái này giá bao nhiêu?","exampleDe":"Entschuldigung, wie viel kostet ein Kilo Äpfel?","exampleVi":"Xin lỗi, một ký táo giá bao nhiêu ạ?"},
    {"de":"mit Karte zahlen","pronunciation":"[mɪt ''kaʁtə ''tsa:lən]","vi":"Thanh toán bằng thẻ","exampleDe":"Kann ich mit Karte zahlen?","exampleVi":"Tôi có thể thanh toán bằng thẻ được không?"},
    {"de":"die Tüte","pronunciation":"[''ty:tə]","vi":"Túi đựng (túi nilon/túi giấy)","exampleDe":"Brauchen Sie eine Tüte?","exampleVi":"Bạn có cần một chiếc túi đựng không?"}
  ]$json$::jsonb,
  $json${"title":"Sử dụng Động từ khuyết thiếu ''Können'' & ''Möchten'' khi mua sắm","rule":"Động từ khuyết thiếu đứng ở vị trí thứ 2 trong câu trần thuật hoặc đầu câu hỏi Yes/No, động từ chính mang nghĩa thực sự sẽ bị đẩy xuống cuối câu ở dạng nguyên thể (Infinitiv).\n- Ich möchte bezahlen (Tôi muốn thanh toán).\n- Kann ich bar bezahlen? (Tôi có thể trả bằng tiền mặt không?)","examples":[{"de":"Wir möchten Äpfel kaufen.","vi":"Chúng tôi muốn mua táo."},{"de":"Kannst du mir helfen?","vi":"Bạn có thể giúp tôi được không?"}]}$json$::jsonb
),
(
  'b1-l1', 'm-b1-1', 'B1',
  'Meinung äußern & Argumentieren',
  'Bày tỏ quan điểm & Thảo luận biện luận',
  'Trình bày luận điểm đồng tình hoặc phản đối một cách có cấu trúc học thuật, sử dụng các liên từ bổ trợ phức tạp.',
  'Ở trình độ B1, bạn không chỉ giao tiếp sinh hoạt đơn thuần nữa mà cần thuyết phục đồng nghiệp, cấp trên hoặc đưa ra ý kiến tranh biện về các chủ đề xã hội phổ biến như làm việc từ xa, bảo vệ môi trường hay giao thông công cộng.',
  '08:30', 1, 15,
  $json$[
    {"de":"Meiner Meinung nach...","pronunciation":"[''maɪnɐ ''maɪnʊŋ na:x]","vi":"Theo quan điểm của tôi thì...","exampleDe":"Meiner Meinung nach ist Heimarbeit sehr flexibel.","exampleVi":"Theo quan điểm của tôi thì làm việc tại nhà rất linh hoạt."},
    {"de":"Ich stimme dir zu","pronunciation":"[ɪç ''ʃtɪmə di:ɐ ''tsu:]","vi":"Tôi đồng ý với bạn","exampleDe":"Das ist ein guter Punkt. Ich stimme dir zu.","exampleVi":"Đó là một ý kiến hay. Tôi đồng ý với bạn."},
    {"de":"einerseits ... andererseits","pronunciation":"[''aɪnɐ''zaɪts ... ''andəʁə''zaɪts]","vi":"Một mặt thì... mặt khác thì...","exampleDe":"Einerseits spart man Zeit, andererseits vermisst man Kollegen.","exampleVi":"Một mặt ta tiết kiệm thời gian, mặt khác ta lại nhớ đồng nghiệp."},
    {"de":"überzeugen","pronunciation":"[y:bɐ''tsɔɪgən]","vi":"Thuyết phục","exampleDe":"Deine Argumente haben mich überzeugt.","exampleVi":"Các luận điểm của bạn đã thuyết phục được tôi."}
  ]$json$::jsonb,
  $json${"title":"Các liên từ phụ thuộc ''dass'' (rằng) và ''weil'' (bởi vì)","rule":"Trong câu phụ (Nebensatz) bắt đầu bằng ''dass'', ''weil'', hoặc ''obwohl'', động từ đã chia (konjugiertes Verb) luôn luôn bị đẩy xuống đứng ở vị trí CUỐI CÙNG của mệnh đề đó.","examples":[{"de":"Ich denke, dass er recht hat.","vi":"Tôi nghĩ rằng anh ấy nói đúng."},{"de":"Ich helfe dir, weil ich dich mag.","vi":"Tôi giúp bạn vì tôi quý mến bạn."},{"de":"Obwohl es regnet, gehen wir spazieren.","vi":"Mặc dù trời mưa, chúng tôi vẫn đi dạo."}]}$json$::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- quiz_questions  (correct_answer lưu ở đây, không bao giờ gửi về client)
-- ---------------------------------------------------------------------------

-- a1-l1 quiz
INSERT INTO quiz_questions (lesson_id, type, question_text, options, correct_answer, explanation, order_index) VALUES
(
  'a1-l1', 'multiple-choice',
  'Lựa chọn từ thích hợp để điền vào chỗ trống: ''Ich _____ aus Vietnam.''',
  '["komme","kommst","kommt","kommen"]'::jsonb,
  'komme',
  'Với chủ ngữ ''Ich'' (ngôi thứ nhất số ít), động từ ''kommen'' được chia thành ''komme'' (bỏ đuôi -en và thêm đuôi -e).',
  1
),
(
  'a1-l1', 'fill-blank',
  'Điền dạng đúng của động từ ''heißen'' để hoàn thành câu sau: ''Wie ______ du?''',
  NULL,
  'heißt',
  'Với ngôi thứ hai số ít ''du'', động từ ''heißen'' chia thành ''heißt'' (vì thân động từ kết thúc bằng ''ß'' phát âm như ''s'', ta chỉ cần thêm đuôi -t thay vì -st).',
  2
),
(
  'a1-l1', 'matching',
  'Ghép các từ tiếng Đức sau với nghĩa tiếng Việt tương ứng:',
  NULL,
  'Guten Tag:Xin chào|Auf Wiedersehen:Tạm biệt|Freut mich:Rất vui được gặp|Danke:Cảm ơn',
  'Các câu hội thoại giao tiếp xã giao thông dụng trong chủ đề Nhập môn.',
  3
),
(
  'a1-l1', 'listening',
  'Lắng nghe từ phát âm và chọn nghĩa đúng của câu vừa nghe (Nhấn nút audio để nghe lại):',
  '["Hẹn gặp lại ngài ngày mai","Rất hân hạnh được làm quen với ngài","Tôi cũng khỏe, cảm ơn","Bạn sống ở đâu thế"]'::jsonb,
  'Rất hân hạnh được làm quen với ngài',
  '''Es freut mich, Sie kennenzulernen'' là mẫu câu lịch sự dùng để nói ''Rất hân hạnh được làm quen với ngài'' trong lần đầu gặp mặt.',
  4
);

-- a1-l2 quiz
INSERT INTO quiz_questions (lesson_id, type, question_text, options, correct_answer, explanation, order_index) VALUES
(
  'a1-l2', 'multiple-choice',
  'Ký tự ''ß'' trong tiếng Đức có thể viết tương đương bằng tổ hợp chữ cái nào?',
  '["sh","sz","ss","ch"]'::jsonb,
  'ss',
  'Trong nhiều văn bản hoặc khi đánh máy không hỗ trợ ký tự ''ß'', người ta thay thế bằng ''ss'' (ví dụ: ''Heißt'' thành ''Heisst'').',
  1
),
(
  'a1-l2', 'fill-blank',
  'Điền số bằng chữ đúng của phép tính sau: ''Zwei + Drei = ______'' (Gợi ý số 5 bằng tiếng Đức)',
  NULL,
  'fünf',
  '2 (zwei) + 3 (drei) = 5 (fünf).',
  2
),
(
  'a1-l2', 'matching',
  'Ghép các số đếm tiếng Đức sau với số biểu thị:',
  NULL,
  'eins:1|vier:4|sieben:7|zehn:10',
  'Các số đếm căn bản trong tiếng Đức.',
  3
),
(
  'a1-l2', 'listening',
  'Nghe từ và viết lại số đếm bạn nghe được dạng chữ thường:',
  '["eins","elf","zwölf","acht"]'::jsonb,
  'elf',
  'Từ nghe được là ''elf'' có nghĩa là số mười một.',
  4
);

-- a2-l1 quiz
INSERT INTO quiz_questions (lesson_id, type, question_text, options, correct_answer, explanation, order_index) VALUES
(
  'a2-l1', 'multiple-choice',
  'Chọn cách diễn đạt tiếng Đức cho câu hỏi: ''Tôi có thể thanh toán bằng thẻ được không?''',
  '["Kann ich mit Karte zahlen?","Ich muss mit Karte bezahlen.","Darf ich bar bezahlen?","Haben Sie eine Karte?"]'::jsonb,
  'Kann ich mit Karte zahlen?',
  '''Kann ich mit Karte zahlen?'' là cấu trúc thông dụng tại quầy thu ngân để đề xuất thanh toán bằng thẻ ngân hàng.',
  1
),
(
  'a2-l1', 'fill-blank',
  'Điền một động từ khuyết thiếu thích hợp vào câu sau: ''Ich _____ gerne ein Kilo Tomaten kaufen, bitte.'' (Gợi ý nghĩa: muốn/lịch sự)',
  NULL,
  'möchte',
  '''möchte'' được sử dụng phổ biến khi gọi món hoặc mua hàng để thể hiện yêu cầu một cách lịch sự (Tôi muốn mua...).',
  2
),
(
  'a2-l1', 'matching',
  'Ghép các loại thực phẩm thường gặp sau:',
  NULL,
  'das Brot:Bánh mì|die Milch:Sữa|das Gemüse:Rau củ|das Fleisch:Thịt',
  'Tên các thực phẩm cơ bản cần biết trong siêu thị.',
  3
),
(
  'a2-l1', 'listening',
  'Lắng nghe câu thoại sau và điền từ còn thiếu vào chỗ trống: ''Brauchen Sie einen _____?'' (Nghe nghĩa: biên lai/hóa đơn)',
  '["Kassenbon","Einkaufswagen","Beutel","Ausweis"]'::jsonb,
  'Kassenbon',
  '''Kassenbon'' chính là tờ hóa đơn nhỏ in ra ở quầy thu ngân siêu thị Đức.',
  4
);

-- b1-l1 quiz
INSERT INTO quiz_questions (lesson_id, type, question_text, options, correct_answer, explanation, order_index) VALUES
(
  'b1-l1', 'multiple-choice',
  'Chọn trật tự từ đúng trong câu phụ: ''Ich glaube, dass...''',
  '["tiếng Đức rất thú vị là (Deutsch sehr interessant ist).","tiếng Đức là rất thú vị (Deutsch ist sehr interessant).","rất thú vị tiếng Đức là (sehr interessant Deutsch ist).","tiếng Đức rất là thú vị (Deutsch sehr ist interessant)."]'::jsonb,
  'tiếng Đức rất thú vị là (Deutsch sehr interessant ist).',
  'mệnh đề phụ với liên từ ''dass'' bắt buộc động từ chia ''ist'' phải đặt ở cuối cùng của câu.',
  1
),
(
  'b1-l1', 'fill-blank',
  'Điền liên từ thích hợp để kết nối hai vế câu: ''Ich fahre mit dem Bus, ______ es umweltfreundlicher ist.'' (Nghĩa: bởi vì)',
  NULL,
  'weil',
  '''weil'' giới thiệu một mệnh đề phụ chỉ nguyên nhân lý do và đẩy động từ chia ''ist'' về cuối câu.',
  2
),
(
  'b1-l1', 'matching',
  'Ghép cặp các mẫu câu thể hiện sự đồng tình / phản đối:',
  NULL,
  'Das sehe ich auch so:Tôi cũng nhìn nhận như vậy|Da muss ich widersprechen:Trường hợp này tôi phải phản phản đối|Ich bin mir nicht sicher:Tôi không chắc chắn lắm|Genau!:Chính xác luôn!',
  'Các mẫu câu phục vụ thảo luận, đàm thoại thảo luận chuyên sâu.',
  3
),
(
  'b1-l1', 'listening',
  'Lắng nghe cụm từ sau và chọn nghĩa tiếng Việt chính xác nhất:',
  '["Trong mọi trường hợp / Nhất định","Không đời nào / Tuyệt đối không","Tùy cơ ứng biến","Có thể xảy ra"]'::jsonb,
  'Trong mọi trường hợp / Nhất định',
  '''auf jeden Fall'' tương đương ''in any case'' hoặc ''definitely'' trong tiếng Anh.',
  4
);

-- matching_pairs cho các câu matching (dùng trong frontend để render bài ghép)
UPDATE quiz_questions SET matching_pairs = '[{"de":"Guten Tag","vi":"Xin chào"},{"de":"Auf Wiedersehen","vi":"Tạm biệt"},{"de":"Freut mich","vi":"Rất vui được gặp"},{"de":"Danke","vi":"Cảm ơn"}]'::jsonb
  WHERE lesson_id = 'a1-l1' AND type = 'matching';

UPDATE quiz_questions SET matching_pairs = '[{"de":"eins","vi":"1"},{"de":"vier","vi":"4"},{"de":"sieben","vi":"7"},{"de":"zehn","vi":"10"}]'::jsonb
  WHERE lesson_id = 'a1-l2' AND type = 'matching';

UPDATE quiz_questions SET matching_pairs = '[{"de":"das Brot","vi":"Bánh mì"},{"de":"die Milch","vi":"Sữa"},{"de":"das Gemüse","vi":"Rau củ"},{"de":"das Fleisch","vi":"Thịt"}]'::jsonb
  WHERE lesson_id = 'a2-l1' AND type = 'matching';

UPDATE quiz_questions SET matching_pairs = '[{"de":"Das sehe ich auch so","vi":"Tôi cũng nhìn nhận như vậy"},{"de":"Da muss ich widersprechen","vi":"Trường hợp này tôi phải phản phản đối"},{"de":"Ich bin mir nicht sicher","vi":"Tôi không chắc chắn lắm"},{"de":"Genau!","vi":"Chính xác luôn!"}]'::jsonb
  WHERE lesson_id = 'b1-l1' AND type = 'matching';

-- audio_text cho listening questions
UPDATE quiz_questions SET audio_text = 'Es freut mich, Sie kennenzulernen!'
  WHERE lesson_id = 'a1-l1' AND type = 'listening';

UPDATE quiz_questions SET audio_text = 'elf'
  WHERE lesson_id = 'a1-l2' AND type = 'listening';

UPDATE quiz_questions SET audio_text = 'Kassenbon'
  WHERE lesson_id = 'a2-l1' AND type = 'listening';

UPDATE quiz_questions SET audio_text = 'auf jeden Fall'
  WHERE lesson_id = 'b1-l1' AND type = 'listening';
