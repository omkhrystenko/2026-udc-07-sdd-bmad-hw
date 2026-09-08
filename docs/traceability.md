# Простежуваність: spec → code → tests (Task C)

**Специфікація:** [`docs/spec/pricing-discounts.md`](spec/pricing-discounts.md)
**Дельта-спека інструмента:** `openspec/changes/add-order-discount-engine/specs/order-discounts/spec.md`
**Реалізація:** `app/src/discounts.ts`
**Тести:** `app/src/discounts.test.ts` (15 тестів; плюс 8 наявних у `pricing.test.ts`)

## Таблиця

| AC | Що перевіряє | Де реалізовано (файл:символ) | Тест (назва) | Статус |
|---|---|---|---|---|
| AC-1 | Знижка за рівнем Gold = 10% від товарів | `discounts.ts:priceOrder` (`tierDiscount`) | `AC-1: gold tier alone discounts 10% of the goods` | ✅ |
| AC-2 | Прострочений промокод → `expired`, без винятку | `discounts.ts:priceOrder` (перевірка `now >= expiresAt`) | `AC-2: an expired coupon is rejected, not applied and not thrown` | ✅ |
| AC-3 | Один промокод на скоуп; другий → `scope-occupied` | `discounts.ts:priceOrder` (`occupiedScopes`) | `AC-3: of two coupons on one category only the first typed applies` | ✅ |
| AC-4 | Фіксований промокод > суми: підсумок = доставка *(граничний)* | `discounts.ts:priceOrder` (`Math.min(rawDiscount, scopeBase)`) | `AC-4: a fixed coupon larger than the order leaves shipping only, never a negative total` | ✅ |
| AC-5 | Каскад: 10% + 15% = 23 500, а не 25 000 | `discounts.ts:priceOrder` (`remaining -= discount`) | `AC-5: tier and coupon cascade, they do not add up to 25%` | ✅ |
| AC-6 | Доставка додається після знижок і не дисконтується | `discounts.ts:priceOrder` (`shippingKopecks` після циклу) | `AC-6: shipping is added after discounts and never discounted` | ✅ |
| AC-7 | `minSubtotalKopecks` звіряється з `goodsSubtotal` до знижок | `discounts.ts:priceOrder` (перевірка `below-min-subtotal`) | `AC-7: the minimum subtotal is judged before discounts, not after` | ✅ |
| AC-8 | Пів копійки → вгору (615,5 → 616) *(граничний)* | `discounts.ts:roundHalfUp` | `AC-8: half a kopeck rounds up, in the customer's favour` | ✅ |
| AC-9 | Порожнє замовлення: усі нулі, промокод `not-applicable` *(граничний)* | `discounts.ts:scopeBaseKopecks` (гілка `goodsSubtotal === 0`) + `priceOrder` | `AC-9: an empty order prices to zero and rejects the coupon` | ✅ |
| AC-10 | База категорійного промокоду = частка категорії в залишку | `discounts.ts:scopeBaseKopecks`, `discounts.ts:categorySubtotalKopecks` | `AC-10: a category coupon takes that category's share of the remainder` | ✅ |
| AC-11 | Той самий код двічі → `duplicate`, знижка одна | `discounts.ts:priceOrder` (`seenCodes`) | `AC-11: the same code typed twice is counted once` | ✅ |
| AC-12 | Невідомий код → `unknown`, розрахунок проходить | `discounts.ts:priceOrder` (`catalog.find` → `undefined`) | `AC-12: a code missing from the catalog is rejected as unknown` | ✅ |
| AC-13 | Категорії немає в замовленні → `not-applicable`, скоуп вільний | `discounts.ts:priceOrder` (перевірка `scopeBase === 0` **до** occupancy) | `AC-13: a coupon for an absent category does not occupy that scope` | ✅ |
| AC-14 | Без рівня й промокодів обидва нулі присутні в розкладці | `discounts.ts:priceOrder` (форма `PriceBreakdown`) | `AC-14: without a tier or coupons the breakdown still carries both zeros` | ✅ |
| AC-15 | Повтор **відхиленого** коду лишається `expired`, а не `duplicate` | `discounts.ts:priceOrder` (`seenCodes` наповнюється лише застосованими) | `AC-15: an expired code typed twice is expired twice, never a duplicate` | ✅ |

Перевірка: `cd app && npm test` → **23 passed** (8 `pricing.test.ts` +
15 `discounts.test.ts`), `npm run typecheck` без помилок.

> AC-15 і рядок D-17 у специфікації з'явилися **після** коду — їх знайшла
> зворотна перевірка нижче. Це не дефект процесу, а його результат.

## Зворотна перевірка

Проходив у зворотний бік — від рядків `discounts.ts` до критеріїв — і окремо
звірявся зі звітом прогону A (Task D): той агент реалізовував ту саму спеку
незалежно й перелічив шість місць, які довелося довизначити самому. Обидва
джерела вказали на **одне й те саме** місце (пункт 1 нижче).

**Чи є в коді поведінка, якої немає в жодному AC?** Знайшлось чотири місця.

1. **Що означає «код уже враховано» в `duplicate`.** У моєму коді `seenCodes`
   наповнюється **лише** промокодами, які справді дали знижку, тож два однакові
   прострочені коди дають дві відмови `expired`. Прогін A поставив
   `seenCodes.add` одразу після знаходження коду в каталозі — тобто в нього
   вийшло б `expired` + `duplicate`. Обидві реалізації сумлінно виконують D-10;
   D-10 просто не був про це. **Виправлено в спеці**: у D-10 додано речення про
   відхилені екземпляри, і додано критерій **AC-15** із тестом. Причина вибору:
   сказати клієнту «дублікат» про прострочений код — приховати від нього
   справжню причину, і він виправлятиме не те.
2. **Порівняння кодів чутливе до регістру** (`catalog.find(c => c.code === code)`).
   Жоден AC цього не вимагав; прогін A теж це помітив і вибрав так само, але
   міг би вибрати інакше. **Записано як D-17.**
3. **Каталог із двома записами під одним `code`** — `find` мовчки бере перший.
   Не сказано ніде. **Записано як D-17.**
4. **Промокод із `value: 0`** проходить усі перевірки, дає знижку 0 і при цьому
   **займає скоуп**, глушачи наступний промокод на ту саму категорію. Це
   найближче до справжньої «зайвої поведінки»: воно суперечить духу D-11
   (промокод, що нічого не дав, не має нікого блокувати), але не суперечить
   його букві (там ідеться про базу скоупу, а не про суму знижки).
   **Записано як D-17** зі свідомим рішенням не боротись: §2 оголошує каталог
   довіреним, а промокод на 0% — помилка того, хто наповнює каталог, і
   «розумна» поведінка рушія лише замаскувала б її.

Пункти 2–4 навмисно **не отримали власних AC**: усі три виникають лише з
неправильно наповненого каталогу, що §2 виводить за межі скоупу. Тест на них
зафіксував би поведінку, якої бізнес не замовляв. Але записати їх у спеку
довелося — бо без цього рядка реалізація обирає варіант мовчки, і два прогони
цілком можуть обрати різні.

**Чи є AC без тесту?** Немає — 15 критеріїв, 15 тестів, кожен названо за ID.
AC-7 містить дві половини (поріг досягнуто / не досягнуто) — обидві в одному
тесті, бо це одна розвилка D-6, і розділяти її означало б розірвати зв'язок.

**Чи є тест, який не мапиться на жоден AC?** У `discounts.test.ts` — немає.
8 тестів у `pricing.test.ts` не мапляться на AC цієї специфікації, і так і має
бути: вони закривають уже специфіковану поведінку (`subtotal`, `shipping`,
`tierPercent`), якої ця зміна не торкається. Їхня зеленість — регресійна
гарантія, що рушій знижок нічого не переозначив.

## Що з цього вийшло

Зворотна перевірка знайшла чотири розбіжності. Жодна з них не була помилкою в
коді — усі чотири виявились **дірками в специфікації**, і правити довелося
спеку, а не реалізацію: одне уточнення D-10 із новим критерієм AC-15 і один
новий рядок D-17 на три випадки, які свідомо лишено поза скоупом.

Показово, **де** спека порвалась. Не всередині правил — кожне з D-1…D-16
окремо сформульоване так, що прогін A відтворив мої числа до копійки. Порвалась
вона на **межах**: на взаємодії двох правил (D-8 × D-10: що робити з повтором
уже відхиленого коду) і на станах вхідних даних, які я оголосив «довіреними» й
тому не описав узагалі. Це та частина роботи, яку не видно, поки не почнеш
писати код, — і, схоже, єдиний спосіб її знайти — це або написати код, або дати
спеку другому незалежному виконавцю. Тут спрацювали обидва способи й показали на
одне місце.
