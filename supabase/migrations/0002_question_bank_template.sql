-- The "mother set": the default question bank every new workspace is cloned from.
-- Edit rows in public.question_bank per workspace; edit this table to change the
-- starting point for future workspaces.

create table if not exists public.question_bank_template (
  code       text primary key,
  text_en    text not null,
  text_vi    text,
  field_ids  text[] not null default '{}',
  section_id text not null,
  phase      text not null default 'discover',
  priority   int not null default 100,
  ask_when   text
);

alter table public.question_bank_template enable row level security;
drop policy if exists "anyone authenticated may read the template" on public.question_bank_template;
create policy "anyone authenticated may read the template"
  on public.question_bank_template for select to authenticated using (true);

insert into public.question_bank_template
  (code, text_en, text_vi, field_ids, section_id, phase, priority, ask_when)
values
-- ── Opening ──────────────────────────────────────────────────────────────────
('Q001','Before we dive in — how would you describe the brand and the category you compete in today?','Trước khi đi sâu, anh/chị mô tả thương hiệu và ngành hàng mình đang cạnh tranh như thế nào ạ?','{brand_name,category}','snapshot','open',10,'Always open with this; it calibrates every later question.'),
('Q002','Who owns the brand legally, and which entity would we be contracting with?','Pháp nhân nào sở hữu thương hiệu, và mình sẽ ký hợp đồng với đơn vị nào ạ?','{parent_company}','snapshot','open',20,null),
('Q003','Which markets are we talking about, and is Vietnam new territory or an existing one?','Mình đang nói đến những thị trường nào, và Việt Nam là thị trường mới hay đã có sẵn ạ?','{markets,local_presence}','snapshot','open',25,null),
('Q004','Who else on your side will be involved in this project?','Về phía anh/chị, còn ai sẽ tham gia dự án này ạ?','{stakeholders}','snapshot','open',30,'Also the soft opening for the decision-maker map later.'),
-- ── Objective ────────────────────────────────────────────────────────────────
('Q010','If we sit here twelve months from now and this has gone extremely well, what happened?','Nếu 12 tháng nữa mình ngồi lại và mọi thứ rất tốt, thì điều gì đã xảy ra ạ?','{primary_goal,success_metrics}','objective','open',15,'Strong opener — gets the objective in their own language.'),
('Q011','What is the revenue or GMV target for that period, and for which channels?','Mục tiêu doanh thu hoặc GMV cho giai đoạn đó là bao nhiêu, và cho những kênh nào ạ?','{revenue_target}','objective','discover',20,'Push for a number. A range is acceptable; "growth" is not.'),
('Q012','What is driving the timing — why this year rather than next?','Điều gì thúc đẩy thời điểm này — tại sao là năm nay mà không phải năm sau ạ?','{why_now,timeline}','objective','discover',30,null),
('Q013','What are the KPIs you personally get measured on internally?','Nội bộ đánh giá anh/chị dựa trên những chỉ số nào ạ?','{success_metrics}','objective','deep',40,'Reveals the real objective when the stated one is vague.'),
('Q014','Are there hard dates we must hit — a launch, a campaign, a board review?','Có mốc thời gian bắt buộc nào không — ra mắt, chiến dịch, hay họp hội đồng ạ?','{timeline}','objective','discover',35,null),
-- ── Current state ────────────────────────────────────────────────────────────
('Q020','Which channels are selling today, and roughly what does each contribute?','Hiện tại những kênh nào đang bán, và mỗi kênh đóng góp khoảng bao nhiêu ạ?','{current_channels,current_performance}','current_state','discover',20,null),
('Q021','What does the last full year look like in revenue terms?','Doanh thu năm vừa rồi của mình như thế nào ạ?','{current_performance}','current_state','discover',30,'If they deflect, ask for order of magnitude or growth rate instead.'),
('Q022','Who are you working with today — distributors, agencies, enablers?','Hiện mình đang hợp tác với ai — nhà phân phối, agency, hay đơn vị vận hành ạ?','{current_partners}','current_state','discover',35,null),
('Q023','What is not working today that made you take this meeting?','Điều gì hiện chưa ổn khiến anh/chị muốn gặp bên em hôm nay ạ?','{pain_points}','current_state','discover',15,'The highest-yield question in the set. Ask early, let silence work.'),
('Q024','What have you already tried to fix that, and why did it fall short?','Mình đã thử cách nào để khắc phục chưa, và vì sao chưa hiệu quả ạ?','{pain_points,alternatives}','current_state','deep',45,'Follow-up to Q023 — do not ask standalone.'),
-- ── Product & pricing ────────────────────────────────────────────────────────
('Q030','Which three to five SKUs drive most of your volume?','Ba đến năm SKU nào đang mang lại phần lớn sản lượng ạ?','{hero_skus}','product','discover',40,null),
('Q031','How many SKUs are live in total, and how many can be sold in this market?','Tổng cộng mình có bao nhiêu SKU, và bao nhiêu bán được ở thị trường này ạ?','{portfolio_breadth}','product','discover',60,null),
('Q032','What are the retail price points, and what is the average selling price?','Giá bán lẻ ở mức nào, và giá bán trung bình là bao nhiêu ạ?','{price_ladder}','product','discover',45,null),
('Q033','What trade margin is available to a partner at those prices?','Với mức giá đó, biên lợi nhuận dành cho đối tác là bao nhiêu ạ?','{margin_structure}','product','deep',50,'Sensitive — ask after rapport, not in the first ten minutes.'),
('Q034','How much room is there for promotion and platform vouchers within that margin?','Trong biên đó, mình còn dư địa bao nhiêu cho khuyến mãi và voucher sàn ạ?','{margin_structure}','product','deep',65,null),
('Q035','What are the MOQ, lead time and shelf life we would be planning around?','MOQ, thời gian giao hàng và hạn sử dụng mình cần tính toán là bao nhiêu ạ?','{supply_terms}','product','deep',70,null),
('Q036','Who carries the inventory risk in the model you have in mind?','Trong mô hình anh/chị hình dung, ai chịu rủi ro tồn kho ạ?','{supply_terms,engagement_model}','product','deep',75,null),
-- ── Consumer & positioning ───────────────────────────────────────────────────
('Q040','Who is the target consumer — not just demographics, but when and why they buy?','Khách hàng mục tiêu là ai — không chỉ nhân khẩu học, mà mua khi nào và vì sao ạ?','{target_consumer}','consumer','discover',40,null),
('Q041','What is the one message the brand must own in this market?','Thông điệp nào thương hiệu bắt buộc phải sở hữu ở thị trường này ạ?','{positioning}','consumer','discover',50,null),
('Q042','Are there claims or creative treatments that are off-limits globally?','Có thông điệp hay cách thể hiện nào bị cấm theo quy định toàn cầu không ạ?','{positioning}','consumer','deep',80,null),
('Q043','Who do you benchmark against here, and where are you losing to them?','Mình so sánh với đối thủ nào, và đang thua họ ở điểm nào ạ?','{competitive_set,differentiator}','consumer','discover',55,null),
('Q044','Why does a shopper pick you over that competitor today?','Vì sao khách hàng chọn mình thay vì đối thủ đó ạ?','{differentiator}','consumer','deep',60,null),
-- ── Channel ──────────────────────────────────────────────────────────────────
('Q050','If you had to rank the platforms by priority, what is the order and why?','Nếu phải xếp thứ tự ưu tiên các sàn, thứ tự là gì và vì sao ạ?','{priority_platforms}','channel','discover',30,null),
('Q051','Do official stores already exist, and who controls those accounts today?','Gian hàng chính hãng đã có chưa, và hiện ai đang quản lý tài khoản đó ạ?','{store_status}','channel','discover',35,'Account ownership is a frequent hidden blocker — do not skip.'),
('Q052','How do you handle grey-market sellers and price policing today?','Hiện mình xử lý hàng xách tay và kiểm soát giá như thế nào ạ?','{channel_conflict}','channel','deep',60,null),
('Q053','Is there an offline business we need to protect, and how?','Có mảng offline nào mình cần bảo vệ không, và bảo vệ ra sao ạ?','{channel_conflict}','channel','deep',65,null),
('Q054','What split across channels would you want at the end of the period?','Cuối kỳ, anh/chị muốn tỷ trọng giữa các kênh như thế nào ạ?','{channel_ambition}','channel','deep',70,null),
-- ── Marketing ────────────────────────────────────────────────────────────────
('Q060','What marketing budget is committed for this, and who signs it off?','Ngân sách marketing cam kết cho việc này là bao nhiêu, và ai duyệt ạ?','{marketing_budget}','marketing','deep',30,'Critical and commonly dodged. If deflected, ask for A&P as % of revenue.'),
('Q061','Is that budget a fixed amount or a percentage of revenue?','Ngân sách đó là con số cố định hay theo phần trăm doanh thu ạ?','{marketing_budget}','marketing','deep',45,null),
('Q062','What creative assets already exist, and what needs localising?','Mình đã có sẵn tài sản sáng tạo nào, và cần bản địa hóa những gì ạ?','{content_assets}','marketing','deep',60,null),
('Q063','How long does content approval typically take on your side?','Thông thường phía anh/chị duyệt nội dung mất bao lâu ạ?','{content_assets}','marketing','deep',75,'Sets realistic campaign lead times in the plan.'),
('Q064','What is your appetite for livestream, KOL and affiliate commission?','Mức độ sẵn sàng của mình với livestream, KOL và hoa hồng affiliate ra sao ạ?','{kol_affiliate}','marketing','deep',55,null),
('Q065','Are there campaign moments already committed in the calendar?','Có sự kiện hay chiến dịch nào đã chốt trong lịch chưa ạ?','{campaign_calendar}','marketing','deep',85,null),
-- ── Operations ───────────────────────────────────────────────────────────────
('Q070','Who would warehouse and ship the stock, and from where?','Ai sẽ lưu kho và giao hàng, và xuất từ đâu ạ?','{fulfilment_model}','operations','deep',60,null),
('Q071','What is the status of import licences, product registration and labelling?','Tình trạng giấy phép nhập khẩu, công bố sản phẩm và nhãn mác thế nào ạ?','{regulatory}','operations','deep',40,'Regulatory gaps routinely push launch dates by a quarter or more.'),
('Q072','Who owns the regulatory work — your side or the partner?','Ai phụ trách phần pháp lý — phía anh/chị hay đối tác ạ?','{regulatory}','operations','deep',70,null),
('Q073','What systems do you run, and what data could you share with a partner?','Mình đang dùng hệ thống nào, và có thể chia sẻ dữ liệu gì với đối tác ạ?','{systems}','operations','deep',90,null),
-- ── Commercials ──────────────────────────────────────────────────────────────
('Q080','What kind of partnership are you looking for — distributor, agency, or something in between?','Anh/chị đang tìm kiểu hợp tác nào — nhà phân phối, agency, hay mô hình kết hợp ạ?','{engagement_model}','commercials','discover',25,null),
('Q081','What commercial terms do you have in mind — fee, margin or commission?','Anh/chị hình dung điều khoản thương mại thế nào — phí, biên lợi nhuận hay hoa hồng ạ?','{commercial_expectation}','commercials','close',40,null),
('Q082','What payment terms are you working with today?','Hiện tại mình áp dụng điều khoản thanh toán nào ạ?','{payment_terms}','commercials','close',60,null),
('Q083','Would this be exclusive, and over what contract term?','Hợp tác này có độc quyền không, và thời hạn hợp đồng bao lâu ạ?','{exclusivity}','commercials','close',55,null),
('Q084','How would you want investment split between the two sides?','Anh/chị muốn chia sẻ đầu tư giữa hai bên như thế nào ạ?','{payment_terms,commercial_expectation}','commercials','close',70,null),
-- ── Decision process ─────────────────────────────────────────────────────────
('Q090','Who signs this off, and is anyone else able to say no?','Ai là người duyệt cuối, và còn ai có quyền từ chối không ạ?','{decision_makers}','decision','close',20,'Never end a meeting without this.'),
('Q091','What criteria will you use to compare proposals?','Anh/chị sẽ dựa trên tiêu chí nào để so sánh các đề xuất ạ?','{decision_criteria}','decision','close',25,null),
('Q092','What is the timeline for making a decision?','Lộ trình ra quyết định của mình như thế nào ạ?','{decision_timeline}','decision','close',30,null),
('Q093','Who else are you speaking to, or is in-housing an option?','Anh/chị còn trao đổi với bên nào khác không, hay có tính tự làm nội bộ ạ?','{alternatives}','decision','close',45,null),
('Q094','What would make you say no to us?','Điều gì có thể khiến anh/chị từ chối bên em ạ?','{objections}','decision','close',50,'Surfaces objections while you are still in the room to answer them.'),
('Q095','What needs to be true for us to move to the next step?','Cần điều kiện gì để hai bên bước sang bước tiếp theo ạ?','{decision_timeline,decision_criteria}','decision','close',35,'Good closing question — converts interest into a next action.'),
-- ── Risks ────────────────────────────────────────────────────────────────────
('Q100','What is the biggest risk you see in making this work?','Theo anh/chị, rủi ro lớn nhất để việc này thành công là gì ạ?','{risks}','risks','close',60,null),
('Q101','Is there anything we have not asked that we should have?','Có điều gì bên em chưa hỏi mà đáng lẽ nên hỏi không ạ?','{open_questions}','risks','close',80,'Always the final question. Frequently yields the most valuable answer.')
on conflict (code) do nothing;
