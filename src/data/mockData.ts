/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Module, Lesson } from "../lib/appTypes";

export const SAMPLE_MODULES: Module[] = [
  {
    id: "m-a1-1",
    level: "A1",
    title: "Einführung & Begrüßung",
    titleVi: "Nhập môn & Chào hỏi",
    lessons: [
      {
        id: "a1-l1",
        level: "A1",
        moduleTitle: "Nhập môn & Chào hỏi",
        listeningClips: [],
        readingPassages: [],
        title: "Sich vorstellen und Begrüßen",
        titleVi: "Chào hỏi và Giới thiệu bản thân",
        duration: "05:40",
        objective: "Học cách chào hỏi cơ bản, giới thiệu tên, tuổi, quê quán bằng tiếng Đức và sử dụng nhuần nhuyễn các ngôi nhân xưng chính.",
        summary: "Trong bài học này, chúng ta sẽ làm quen với các câu chào xã giao phổ biến nhất trong tiếng Đức như 'Guten Tag', 'Hallo' và cách tự giới thiệu bản thân một cách tự nhiên. Bạn sẽ học được cấu trúc hỏi tên người khác và trả lời trang trọng hoặc thân mật.",
        vocabularyMd: `### {{Guten Tag}} — Chào ngày mới / Xin chào (ban ngày)
*['gu:ten ta:k]*

🇩🇪 Guten Tag, wie geht es Ihnen?
🇻🇳 Xin chào, ngài khỏe không?

### {{Wie heißt du?}} — Bạn tên là gì?
*[vi: haɪst du:]*

🇩🇪 Hallo, ich bin Minh. Wie heißt du?
🇻🇳 Chào bạn, mình là Minh. Bạn tên là gì?

### {{Ich komme aus...}} — Tôi đến từ...
*[ɪç 'kɔmə aʊs]*

🇩🇪 Ich komme aus Vietnam.
🇻🇳 Tôi đến từ Việt Nam.

### {{Freut mich}} — Rất vui được làm quen
*[frɔɪt mɪç]*

🇩🇪 Mein Name ist Thomas. - Freut mich!
🇻🇳 Tên tôi là Thomas. - Rất vui được làm quen!

### {{Auf Wiedersehen}} — Tạm biệt (lịch sự)
*['aʊf 'vi:dɐ,ze:ən]*

🇩🇪 Auf Wiedersehen, Frau Schmidt!
🇻🇳 Xin tạm biệt bà Schmidt!`,
        grammar: {
          title: "Động từ 'heißen' (tên là) & Cách chia động từ ở hiện tại",
          rule: "Trong tiếng Đức, động từ thay đổi đuôi tùy thuộc vào chủ ngữ (ngôi). Hãy chú ý quy tắc chia động từ cơ bản với động từ 'heißen' (nhóm động từ có đuôi đặc biệt): \n- Ich (tôi) -> heiße (đuôi -e)\n- Du (bạn) -> heißt (đuôi -t do có âm 'ß')\n- Er/Sie (anh ấy/cô ấy) -> heißt (đuôi -t)\n- Wir / Sie (chúng tôi / Ngài) -> heißen (đuôi -en).",
          examples: [
            { de: "Ich heiße Lam.", vi: "Tôi tên là Lâm." },
            { de: "Wie heißen Sie?", vi: "Ngài tên là gì? (Trang trọng)" },
            { de: "Er heißt Maximilian.", vi: "Anh ấy tên là Maximilian." }
          ]
        },
        quiz: [
          {
            id: "a1-l1-q1",
            type: "multiple-choice",
            questionText: "Lựa chọn từ thích hợp để điền vào chỗ trống: 'Ich _____ aus Vietnam.'",
            options: ["komme", "kommst", "kommt", "kommen"],
            correctAnswer: "komme",
            explanation: "Với chủ ngữ 'Ich' (ngôi thứ nhất số ít), động từ 'kommen' được chia thành 'komme' (bỏ đuôi -en và thêm đuôi -e)."
          },
          {
            id: "a1-l1-q2",
            type: "fill-blank",
            questionText: "Điền dạng đúng của động từ 'heißen' để hoàn thành câu sau: 'Wie ______ du?'",
            correctAnswer: "heißt",
            explanation: "Với ngôi thứ hai số ít 'du', động từ 'heißen' chia thành 'heißt' (vì thân động từ kết thúc bằng 'ß' phát âm như 's', ta chỉ cần thêm đuôi -t thay vì -st)."
          },
          {
            id: "a1-l1-q3",
            type: "matching",
            questionText: "Ghép các từ tiếng Đức sau với nghĩa tiếng Việt tương ứng:",
            matchingPairs: [
              { de: "Guten Tag", vi: "Xin chào" },
              { de: "Auf Wiedersehen", vi: "Tạm biệt" },
              { de: "Freut mich", vi: "Rất vui được gặp" },
              { de: "Danke", vi: "Cảm ơn" }
            ],
            correctAnswer: "Guten Tag:Xin chào|Auf Wiedersehen:Tạm biệt|Freut mich:Rất vui được gặp|Danke:Cảm ơn",
            explanation: "Các câu hội thoại giao tiếp xã giao thông dụng trong chủ đề Nhập môn."
          },
          {
            id: "a1-l1-q4",
            type: "listening",
            questionText: "Lắng nghe từ phát âm và chọn nghĩa đúng của câu vừa nghe (Nhấn nút audio để nghe lại):",
            audioText: "Es freut mich, Sie kennenzulernen!",
            options: [
              "Hẹn gặp lại ngài ngày mai",
              "Rất hân hạnh được làm quen với ngài",
              "Tôi cũng khỏe, cảm ơn",
              "Bạn sống ở đâu thế"
            ],
            correctAnswer: "Rất hân hạnh được làm quen với ngài",
            explanation: "'Es freut mich, Sie kennenzulernen' là mẫu câu lịch sự dùng để nói 'Rất hân hạnh được làm quen với ngài' trong lần đầu gặp mặt."
          }
        ]
      },
      {
        id: "a1-l2",
        level: "A1",
        moduleTitle: "Nhập môn & Chào hỏi",
        listeningClips: [],
        readingPassages: [],
        title: "Das deutsche Alphabet & Zahlen",
        titleVi: "Bảng chữ cái & Số đếm cơ bản",
        duration: "04:50",
        objective: "Nắm vững cách phát âm 26 chữ cái cơ bản, 4 ký tự đặc biệt (ä, ö, ü, ß) và hệ thống số đếm từ 0 đến 20.",
        summary: "Bảng chữ cái viết tương đồng tiếng Anh nhưng cách đọc hoàn chỉnh lại mang âm hưởng đặc trưng. Thêm vào đó, tiếng Đức có các nguyên âm biến đổi Umlaut (ä, ö, ü) cần đặc biệt chú ý khẩu hình. Bạn cũng sẽ học cách đếm tiền xu hoặc đọc số điện thoại đơn giản.",
        vocabularyMd: `### {{die Zahlen}} — Các con số / Số đếm
*[di: 'tsa:lən]*

🇩🇪 Lernen wir heute die Zahlen von eins bis zehn.
🇻🇳 Hôm nay chúng ta cùng học các con số từ một đến mười.

### {{eins}} — số 1
*[aɪns]*

🇩🇪 Eins, zwei, drei!
🇻🇳 Một, hai, ba!

### {{tschüss}} — Chào tạm biệt (thông dụng, thân mật)
*[tʃʏs]*

🇩🇪 Tschüss, bis morgen!
🇻🇳 Tạm biệt nhé, hẹn gặp lại ngày mai!

### {{Wie ist Ihre Telefonnummer?}} — Số điện thoại của Ngài là gì?
*[vi: ɪst 'i:rə tele'fo:n'nʊmɐ]*

🇩🇪 Wie ist Ihre Telefonnummer, Herr Koch?
🇻🇳 Số điện thoại của Ngài là gì vậy, ông Koch?`,
        grammar: {
          title: "Các ký tự đặc biệt Ä, Ö, Ü, ß và quy tắc phát âm",
          rule: "- Ä / ä: Đọc giống âm 'e' hoặc 'ê' trong tiếng Việt. \n- Ö / ö: Tròn môi chữ 'O' nhưng phát âm chữ 'Ê'.\n- Ü / ü: Tròn môi chữ 'U' nhưng phát âm chữ 'I'.\n- ß (Eszett): Đọc như âm 's' kéo dài (không có trong chữ cái viết hoa đầu câu, viết tương đương 'ss').",
          examples: [
            { de: "schön", vi: "Đẹp / Tuyệt vời (phát âm ö)" },
            { de: "Mädchen", vi: "Cô bé (phát âm ä)" },
            { de: "tschüss", vi: "Tạm biệt (phát âm ü)" }
          ]
        },
        quiz: [
          {
            id: "a1-l2-q1",
            type: "multiple-choice",
            questionText: "Ký tự 'ß' trong tiếng Đức có thể viết tương đương bằng tổ hợp chữ cái nào?",
            options: ["sh", "sz", "ss", "ch"],
            correctAnswer: "ss",
            explanation: "Trong nhiều văn bản hoặc khi đánh máy không hỗ trợ ký tự 'ß', người ta thay thế bằng 'ss' (ví dụ: 'Heißt' thành 'Heisst')."
          },
          {
            id: "a1-l2-q2",
            type: "fill-blank",
            questionText: "Điền số bằng chữ đúng của phép tính sau: 'Zwei + Drei = ______' (Gợi ý số 5 bằng tiếng Đức)",
            correctAnswer: "fünf",
            explanation: "2 (zwei) + 3 (drei) = 5 (fünf)."
          },
          {
            id: "a1-l2-q3",
            type: "matching",
            questionText: "Ghép các số đếm tiếng Đức sau với số biểu thị:",
            matchingPairs: [
              { de: "eins", vi: "1" },
              { de: "vier", vi: "4" },
              { de: "sieben", vi: "7" },
              { de: "zehn", vi: "10" }
            ],
            correctAnswer: "eins:1|vier:4|sieben:7|zehn:10",
            explanation: "Các số đếm căn bản trong tiếng Đức."
          },
          {
            id: "a1-l2-q4",
            type: "listening",
            questionText: "Nghe từ và viết lại số đếm bạn nghe được dạng chữ thường:",
            audioText: "elf",
            options: ["eins", "elf", "zwölf", "acht"],
            correctAnswer: "elf",
            explanation: "Từ nghe được là 'elf' có nghĩa là số mười một."
          }
        ]
      }
    ]
  },
  {
    id: "m-a2-1",
    level: "A2",
    title: "Alltag & Freizeit im Ausland",
    titleVi: "Đời sống & Giải trí ở nước ngoài",
    lessons: [
      {
        id: "a2-l1",
        level: "A2",
        moduleTitle: "Đời sống & Giải trí ở nước ngoài",
        listeningClips: [],
        readingPassages: [],
        title: "Einkaufen im Supermarkt",
        titleVi: "Mua sắm trong siêu thị",
        duration: "06:15",
        objective: "Sử dụng mẫu câu đàm thoại khi mua thực phẩm, hỏi giá cả, cân nặng, hỏi phương thức thanh toán thẻ và tiền mặt tại Đức.",
        summary: "Mua sắm tại Đức đòi hỏi bạn nhạy bén với cấu trúc danh từ số nhiều và các đơn vị tiền tệ. Bài học này mô phỏng chân thực một buổi đi siêu thị mua táo, sữa, bánh mì, cách trả lời khi thu ngân hỏi về hóa đơn hay túi đựng.",
        vocabularyMd: `### {{der Supermarkt}} — Siêu thị
*['zu:pɐ,maːkt]*

🇩🇪 Ich gehe in den Supermarkt, um Milch zu kaufen.
🇻🇳 Tôi đi vào siêu thị để mua sữa.

### {{Wie nhiều kostet das?}} — Cái này giá bao nhiêu?
*[vi: vi:l 'kɔstət das]*

🇩🇪 Entschuldigung, wie viel kostet ein Kilo Äpfel?
🇻🇳 Xin lỗi, một ký táo giá bao nhiêu ạ?

### {{mit Karte zahlen}} — Thanh toán bằng thẻ
*[mɪt 'kaʁtə 'tsa:lən]*

🇩🇪 Kann ich mit Karte zahlen?
🇻🇳 Tôi có thể thanh toán bằng thẻ được không?

### {{die Tüte}} — Túi đựng (túi nilon/túi giấy)
*['ty:tə]*

🇩🇪 Brauchen Sie eine Tüte?
🇻🇳 Bạn có cần một chiếc túi đựng không?`,
        grammar: {
          title: "Sử dụng Động từ khuyết thiếu 'Können' & 'Möchten' khi mua sắm",
          rule: "Động từ khuyết thiếu đứng ở vị trí thứ 2 trong câu trần thuật hoặc đầu câu hỏi Yes/No, động từ chính mang nghĩa thực sự sẽ bị đẩy xuống cuối câu ở dạng nguyên thể (Infinitiv).\n- Ich möchte bezahlen (Tôi muốn thanh toán).\n- Kann ich bar bezahlen? (Tôi có thể trả bằng tiền mặt không?)",
          examples: [
            { de: "Wir möchten Äpfel kaufen.", vi: "Chúng tôi muốn mua táo." },
            { de: "Kannst du mir helfen?", vi: "Bạn có thể giúp tôi được không?" }
          ]
        },
        quiz: [
          {
            id: "a2-l1-q1",
            type: "multiple-choice",
            questionText: "Chọn cách diễn đạt tiếng Đức cho câu hỏi: 'Tôi có thể thanh toán bằng thẻ được không?'",
            options: [
              "Kann ich mit Karte zahlen?",
              "Ich muss mit Karte bezahlen.",
              "Darf ich bar bezahlen?",
              "Haben Sie eine Karte?"
            ],
            correctAnswer: "Kann ich mit Karte zahlen?",
            explanation: "'Kann ich mit Karte zahlen?' là cấu trúc thông dụng tại quầy thu ngân để đề xuất thanh toán bằng thẻ ngân hàng."
          },
          {
            id: "a2-l1-q2",
            type: "fill-blank",
            questionText: "Điền một động từ khuyết thiếu thích hợp vào câu sau: 'Ich _____ gerne ein Kilo Tomaten kaufen, bitte.' (Gợi ý nghĩa: muốn/lịch sự)",
            correctAnswer: "möchte",
            explanation: "'möchte' được sử dụng phổ biến khi gọi món hoặc mua hàng để thể hiện yêu cầu một cách lịch sự (Tôi muốn mua...)."
          },
          {
            id: "a2-l1-q3",
            type: "matching",
            questionText: "Ghép các loại thực phẩm thường gặp sau:",
            matchingPairs: [
              { de: "das Brot", vi: "Bánh mì" },
              { de: "die Milch", vi: "Sữa" },
              { de: "das Gemüse", vi: "Rau củ" },
              { de: "das Fleisch", vi: "Thịt" }
            ],
            correctAnswer: "das Brot:Bánh mì|die Milch:Sữa|das Gemüse:Rau củ|das Fleisch:Thịt",
            explanation: "Tên các thực phẩm cơ bản cần biết trong siêu thị."
          },
          {
            id: "a2-l1-q4",
            type: "listening",
            questionText: "Lắng nghe câu thoại sau và điền từ còn thiếu vào chỗ trống: 'Brauchen Sie einen _____?' (Nghe nghĩa: biên lai/hóa đơn)",
            audioText: "Kassenbon",
            options: ["Kassenbon", "Einkaufswagen", "Beutel", "Ausweis"],
            correctAnswer: "Kassenbon",
            explanation: "'Kassenbon' chính là tờ hóa đơn nhỏ in ra ở quầy thu ngân siêu thị Đức."
          }
        ]
      }
    ]
  },
  {
    id: "m-b1-1",
    level: "B1",
    title: "Akademisch & Berufswelt",
    titleVi: "Học thuật & Môi trường Công sở",
    lessons: [
      {
        id: "b1-l1",
        level: "B1",
        moduleTitle: "Học thuật & Môi trường Công sở",
        listeningClips: [],
        readingPassages: [],
        title: "Meinung äußern & Argumentieren",
        titleVi: "Bày tỏ quan điểm & Thảo luận biện luận",
        duration: "08:30",
        objective: "Trình bày luận điểm đồng tình hoặc phản đối một cách có cấu trúc học thuật, sử dụng các liên từ bổ trợ phức tạp.",
        summary: "Ở trình độ B1, bạn không chỉ giao tiếp sinh hoạt đơn thuần nữa mà cần thuyết phục đồng nghiệp, cấp trên hoặc đưa ra ý kiến tranh biện về các chủ đề xã hội phổ biến như làm việc từ xa, bảo vệ môi trường hay giao thông công cộng.",
        vocabularyMd: `### {{Meiner Meinung nach...}} — Theo quan điểm của tôi thì...
*['maɪnɐ 'maɪnʊŋ na:x]*

🇩🇪 Meiner Meinung nach ist Heimarbeit sehr flexibel.
🇻🇳 Theo quan điểm của tôi thì làm việc tại nhà rất linh hoạt.

### {{Ich stimme dir zu}} — Tôi đồng ý với bạn
*[ɪç 'ʃtɪmə di:ɐ 'tsu:]*

🇩🇪 Das ist ein guter Punkt. Ich stimme dir zu.
🇻🇳 Đó là một ý kiến hay. Tôi đồng ý với bạn.

### {{einerseits ... andererseits}} — Một mặt thì... mặt khác thì...
*['aɪnɐ'zaɪts ... 'andəʁə'zaɪts]*

🇩🇪 Einerseits spart man Zeit, andererseits vermisst man Kollegen.
🇻🇳 Một mặt ta tiết kiệm thời gian, mặt khác ta lại nhớ đồng nghiệp.

### {{überzeugen}} — Thuyết phục
*[y:bɐ'tsɔɪgən]*

🇩🇪 Deine Argumente haben mich überzeugt.
🇻🇳 Các luận điểm của bạn đã thuyết phục được tôi.`,
        grammar: {
          title: "Các liên từ phụ thuộc 'dass' (rằng) và 'weil' (bởi vì)",
          rule: "Trong câu phụ (Nebensatz) bắt đầu bằng 'dass', 'weil', hoặc 'obwohl', động từ đã chia (konjugiertes Verb) luôn luôn bị đẩy xuống đứng ở vị trí CUỐI CÙNG của mệnh đề đó.",
          examples: [
            { de: "Ich denke, dass er recht hat.", vi: "Tôi nghĩ rằng anh ấy nói đúng." },
            { de: "Ich helfe dir, weil ich dich mag.", vi: "Tôi giúp bạn vì tôi quý mến bạn." },
            { de: "Obwohl es regnet, gehen wir spazieren.", vi: "Mặc dù trời mưa, chúng tôi vẫn đi dạo." }
          ]
        },
        quiz: [
          {
            id: "b1-l1-q1",
            type: "multiple-choice",
            questionText: "Chọn trật tự từ đúng trong câu phụ: 'Ich glaube, dass...'",
            options: [
              "tiếng Đức rất thú vị là (Deutsch sehr interessant ist).",
              "tiếng Đức là rất thú vị (Deutsch ist sehr interessant).",
              "rất thú vị tiếng Đức là (sehr interessant Deutsch ist).",
              "tiếng Đức rất là thú vị (Deutsch sehr ist interessant)."
            ],
            correctAnswer: "tiếng Đức rất thú vị là (Deutsch sehr interessant ist).",
            explanation: "mệnh đề phụ với liên từ 'dass' bắt buộc động từ chia 'ist' phải đặt ở cuối cùng của câu."
          },
          {
            id: "b1-l1-q2",
            type: "fill-blank",
            questionText: "Điền liên từ thích hợp để kết nối hai vế câu: 'Ich fahre mit dem Bus, ______ es umweltfreundlicher ist.' (Nghĩa: bởi vì)",
            correctAnswer: "weil",
            explanation: "'weil' giới thiệu một mệnh đề phụ chỉ nguyên nhân lý do và đẩy động từ chia 'ist' về cuối câu."
          },
          {
            id: "b1-l1-q3",
            type: "matching",
            questionText: "Ghép cặp các mẫu câu thể hiện sự đồng tình / phản đối:",
            matchingPairs: [
              { de: "Das sehe ich auch so", vi: "Tôi cũng nhìn nhận như vậy" },
              { de: "Da muss ich widersprechen", vi: "Trường hợp này tôi phải phản phản đối" },
              { de: "Ich bin mir nicht sicher", vi: "Tôi không chắc chắn lắm" },
              { de: "Genau!", vi: "Chính xác luôn!" }
            ],
            correctAnswer: "Das sehe ich auch so:Tôi cũng nhìn nhận như vậy|Da muss ich widersprechen:Trường hợp này tôi phải phản phản đối|Ich bin mir nicht sicher:Tôi không chắc chắn lắm|Genau!:Chính xác luôn!",
            explanation: "Các mẫu câu phục vụ thảo luận, đàm thoại thảo luận chuyên sâu."
          },
          {
            id: "b1-l1-q4",
            type: "listening",
            questionText: "Lắng nghe cụm từ sau và chọn nghĩa tiếng Việt chính xác nhất:",
            audioText: "auf jeden Fall",
            options: [
              "Trong mọi trường hợp / Nhất định",
              "Không đời nào / Tuyệt đối không",
              "Tùy cơ ứng biến",
              "Có thể xảy ra"
            ],
            correctAnswer: "Trong mọi trường hợp / Nhất định",
            explanation: "'auf jeden Fall' tương đương 'in any case' hoặc 'definitely' trong tiếng Anh."
          }
        ]
      }
    ]
  }
];

export const TESTIMONIALS = [
  {
    name: "Lê Minh Anh",
    role: "Du học sinh Đức ngành Điều dưỡng tại Munich",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80",
    content: "Nhờ học theo lộ trình của DeutschPath từ A1 lên B1, mình đã thi đỗ bằng Goethe B1 chỉ trong vòng 8 tháng học tích cực. Các bài giảng video rất dễ hiểu và phần luyện từ vựng thực tế cực kỳ sướng!"
  },
  {
    name: "Nguyễn Quốc Bảo",
    role: "Kỹ sư Công nghệ thông tin theo diện Blue Card tại Berlin",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&h=150&q=80",
    content: "Học giao tiếp công sở ở mức B1 trên DeutschPath giúp tôi tự tin trao đổi với sếp người Đức ngay trong những tuần đầu nhận việc. Hệ thống bài tập fill-blank rất sát đề thi thực."
  },
  {
    name: "Trần Minh Thư",
    role: "Sinh viên ĐH Ngoại thương, chuẩn bị đi du học Thạc sĩ",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80",
    content: "Các bảng so sánh ngữ âm và dịch nghĩa tiếng Việt dễ hiểu hơn rất nhiều so với học giáo trình nước ngoài thuần túy. Đặc biệt là giao diện siêu đẹp như Duolingo tạo động lực học mỗi ngày!"
  }
];

export const GENERAL_FAQ = [
  {
    q: "Ứng dụng này có miễn phí không?",
    a: "Chúng tôi mở khóa hoàn toàn miễn phí lộ trình A1 bao gồm 10 bài học chất lượng cao, bài kiểm tra và học từ vựng. Gói Premium mở rộng toàn bộ khóa học A2 và B1 với giá cực kỳ tiết kiệm."
  },
  {
    q: "Lộ trình học mất bao lâu?",
    a: "Thông thường một học viên học đều đặn mỗi ngày 30-45 phút sẽ hoàn thành A1 trong 2 tháng, A2 trong 3 tháng và B1 trong 3-4 tháng tiếp theo."
  },
  {
    q: "Tôi có thể luyện nghe nói thế nào?",
    a: "Trong mỗi bài đều có file thu âm phát âm từ vựng chuẩn bản xứ và các câu hỏi dạng listening, giúp bạn cải thiện kỹ năng nghe sâu sắc."
  }
];
