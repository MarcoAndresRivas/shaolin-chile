# Tienda de productos

Objective: sell physical products (uniforms, event t-shirts, rattan staffs, Feiyue shoes) next to seminars and courses, paid by transfer and picked up at the seminar.
Branch: `feat/tienda-productos` (from `main`). Delivery strategy: ask-on-risk (forecast > 400 lines: chain strategy to ask before the PR). Test runner: `node --test` in `backend/` and `web/`.

## Specs

- S1 — "habilitemos desde ya el area de ventas de productos": the site sells products with the existing cart, purchase and transfer payment.
- S2 — "debemos habilitar el area de venta de productos como los uniformes, poleras del evento, bara de ratan, zapatillas feyyue de entrenamiento": products have sizes (talla) with stock per size; a purchase cannot take more than the stock, and cancelling gives the stock back.
- S3 — "que el precio se vea solo al pagar": the product card shows no price; prices show only in the checkout lines and total.
- S4 — "genera una prueba": a seed creates sample products so the store can be tried before the real list arrives ("te pasare un listado de productos que debemos vender si o si").
- S5 — Assumption (from the production document the user read before asking): presale closing date per product, and pickup at the seminar; the confirmation message says the products are picked up at the seminar.
- S6 — Assumption: administration creates and edits products and sizes in the portal, and sees what to hand out by name and size.
- S7 — "esta bien, pero falta la seccion de ventas como si fuera un local": a store page of its own, like a shop, with the products, the cart and the checkout.
- S8 — "utiliza las imagenes nomas no te preocupes": the product photos from the supplier are used on the site (committed), with the real product list.
- S9 — "tienda debes tratarla como tal y no deberia tener el segmento de tu reserva, si no que deberia tener lo acorde a un carro de compras o algo por el estilo": the store has a shopping cart (no "Tu reserva" block): add products to a cart, review it, then pay.
- S10 — "investiga un fronted bonito, elegante, vanguardista y acorde al tema": a researched, elegant, modern design that fits the martial-arts theme.
- S11 — "haz lo que recomiendas de dividirla en partes mas faciles de revisar": the branch is split into chained PRs to main (backend → products and photos → store and portal).
- S12 — "los productos de la tienda siempre estaran disponibles para envio, no exclusivamente para retiro en el seminario, los productos para el seminario son sugerencias y estaran sujetas a disponibilidad si se retiran en ese seminario en especifico": every store order chooses delivery: shipping (always available, with an address) or pickup at the seminar (only for products suggested for the seminar, subject to availability, and only until the presale closes). The seminars page suggests those products. Assumption: shipping is paid by the buyer on delivery (por pagar), since no shipping price was given.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S5 | inline | done | `bc9a19a`; RED 7/8 → GREEN 8/8; backend 205/205; RDD off (clone-local); Risk item 1 (new tables + column) → verifier at feature end |
| T2 | S6 | inline | done | `50eff09`; RED 3 → GREEN 11/11; backend 208/208 (see L5) |
| T3 | S1, S3 | inline | done | `273ef4b`; RED 2 → GREEN 58/58; build ok; browser check (390 px): 4 product cards without price, size M × 2 → checkout $24.000, real purchase registered with pickup message, stock M 10 → 8 |
| T4 | S6 | inline | done | `170daf6`; RED 3 → GREEN 61/61; build ok; browser: admin logs in, Ventas tab shows the 4 sample products, pickup list and totals; creates, sizes and publishes a product that appears in /api/ofertas |
| T6 | S7 | inline | done | `8b0e13e`; RED 2 → GREEN 63/63; build ok (8 pages); browser 1280 and 390 px: /tienda grid with 6 photos and no prices, size picker, cart line, real purchase with pickup message; seminars page links to the store; header fits 390–1920 px (menu button below 1260 px) |
| T7 | S8 | inline | done | `a5dcbb6`; RED 1 → GREEN 13/13; 8 photos as WebP ≤ 900 px (3.9 MB → 0.8 MB); seed with the real list; test checks each seed photo exists |
| T8 | S9, S10, S3 | inline | done | `7d7c877`; RED 2 → GREEN web 63/63, backend product tests 14/14 (products-only order message); build ok; browser 1280 and 390 px: 18/18 checks (grid with photos and no prices, size buttons, side cart opens on add, quantity and remove, cart kept after reload, payment and confirmation inside the cart, seminars checkout still works with the shared buyer form) |
| T10 | S12 | inline | done | `63874bd`; RED → GREEN: backend product tests 18/18 + delivery rollback test; backend 216/216; web 65/65; build ok; browser 12/12 (suggested card ships and picks up, other only ships, pickup offered only for suggestions, shipping requires address, both messages, seminars page suggestions, portal ship/pickup lists and suggestion toggle) |
| T9 | S11 | inline | done | 6 stacked branches pushed (01-backend-productos 8d50d3b 435 lines, 02-backend-entrega 4cc735d 213, 03-productos-reales a42e3e5 137, 04-portal e064b5e 398, 05-tienda 10be423 1016 with size:exception, 06-seminarios d574418 187); each passes its suite and builds; final tree equal to feat/tienda-productos |
| T5 | S4 | inline | done | `29d6136`; RED 1 → GREEN 12/12; `npm run seed:productos` on a local SQLite: 4 products listed by /api/ofertas |

- T1: migration `productos` + `producto_tallas` + `compra_items.producto_talla_id/talla`; public catalog lists products; purchase takes stock; cancel returns it; message mentions pickup.
- T2: admin API to create/edit products and add sizes; purchases list returns item kind and size.
- T3: web store: product card with size picker and no price; cart and checkout include products.
- T4: portal: product form, sizes, stock, and pickup list.
- T5: seed with sample products.
- T6: /tienda page: product grid with photo, size picker and add to cart; checkout; menu link; seminars page links to it.
- T8: store cart: size buttons, add to cart opens a side cart, checkout and confirmation inside it; cart kept in the browser; prices only in the cart and payment.
- T10: delivery choice (envío with address, or retiro for seminar suggestions); presale applies only to pickup; admin marks suggestions and sees what to ship and what to hand out; seminars page shows the suggestions.
- T9: split into chained branches and PRs.
- T7: optimized supplier photos in web/public/ofertas and the seed with the real product list.

Route evidence: no Writer trigger (no parallel units, no context backstop); every task inline.

## Log

- L1 (2026-11-21): "habilitemos desde ya el area de ventas de productos, genera una prueba, te pasare un listado de productos que debemos vender si o si, por mientras avanza en lo demas"
- L2 (2026-11-21): earlier request: "debemos habilitar el area de venta de productos como los uniformes, poleras del evento, bara de ratan, zapatillas feyyue de entrenamiento, investiga eso". Earlier decision: "que el precio se vea solo al pagar".
- L3: map of the sales system (explorer): only `seminario_dia` and `curso` item kinds exist; `readItems`, `anularCompra`, `getCompra` and the web `nothing` check assume them. The portal SalesPanel only validates purchases; it cannot edit the catalog.
- L5 (2026-11-21, T2): one full backend run had 6 failures in finanzas, grados, asistencia and consentimientos tests (no shared code with sales); the baseline without T2 passed 205/205 and the next run with T2 passed 208/208. Recorded as an intermittent flake to investigate apart.
- L6 (2026-11-21): independent verifier on a scratch clone: S1, S2, S3, S5, S6 PASS, S4 PASS on its test; no blockers; parallel purchases never oversold, rejected purchases left all rows unchanged, cancel returns stock once, output without products byte-identical to main. Advisory treated as blocker by the project rule: the cancel message changed for every purchase; fixed so it names the stock only when the purchase had products (RED → GREEN 13/13, backend 210/210, web 61/61, build ok). Also fixed two imports joined on one line in Ofertas.jsx. Remaining advisories, not fixed: MySQL partial-failure reruns of the migration need a manual fix; cierre_preventa accepts out-of-range dates like 2026-13-45; the image check is a blocklist (already on main).
- L7 (2026-11-21): "esta bien, pero falta la seccion de ventas como si fuera un local, ademas utiliza las imagenes nomas no te preocupes". The user authorizes using the supplier photos. The real list came as links (8 Imperio Marcial products read; AliExpress and Mercado Libre pages unreadable). Prices: the suggested ones from the profit document; stock values are assumptions to confirm with the supplier.
- L8 (2026-11-21): "si, tienda debes tratarla como tal y no deberia tener el segmento de tu reserva, si no que deberia tener lo acorde a un carro de compras o algo por el estilo, investiga un fronted bonito, elegante, vanguardista y acorde al tema, ademas haz lo que recomiendas de dividirla en partes mas faciles de revisar". Research: Baymard recommends size buttons over dropdowns; cart drawers keep shoppers on the page and should open on add to cart; 2026 premium stores use dark, minimal, product-first layouts with careful contrast.
- L9 (2026-11-21, T8): store rebuilt as a shop: Tienda.jsx with size buttons and a side cart (dialog) with payment and confirmation; the buyer form is shared (BuyerFields.jsx); the seminars page no longer has a store view. Store orders get their own message (pedido, not cupo/inscripción). Full backend runs failed 1-3 different tests per run with "fetch failed: bad port" from the test harness (random port refused by fetch): pre-existing harness flake, not caused by this feature; to fix apart.
- L10 (2026-11-21): "creo que debes hacer una diferenciacion, los productos de la tienda siempre estaran disponibles para envio, no exclusivamente para retiro en el seminario, los productos para el seminario son sugerencias y estaran sujetas a disponibilidad si se retiran en ese seminario en especifico." Changes S5: pickup at the seminar is one of two delivery options. T10 added before the split (T9).
- L11 (2026-11-21): independent verifier on T8 and T10 (scratch clones of 63874bd and 12f3430): S9, S10 (code only), S3, S12 PASS; no blockers; rejected orders leave data unchanged; seminar purchase output identical to the baseline. Advisories not fixed: the address inputs have no maxLength, so a very long address gets the generic server error; the delivery migration rollback checks only entrega. Slice boundaries recorded in T9; PR bodies outside the repo (PRs-tienda.md). Delivery chain strategy: stacked PRs to main, as recommended and accepted.
- L4: forecast about 700 authored lines (backend ~300, web ~250, portal ~150): above 400, chain strategy to be asked before opening PRs.
