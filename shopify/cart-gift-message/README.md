# Cart gift message — Shopify theme files

The gift message on `shop.maisondvue.com/cart`, rebuilt in the couture
convention: a ruled section heading, one line of explanation, and a choice of
three — no card, a blank house card, or a message we set down by hand. The
writing field stays closed until it is asked for.

These are Shopify theme files, not part of the website this repo serves. They
live here so the cart copy and behaviour are under version control alongside
everything else the house publishes.

## The files

| Here | In the theme |
| --- | --- |
| `snippets--gift-message.liquid` | `snippets/gift-message.liquid` |
| `sections--main-cart-footer.liquid` | `sections/main-cart-footer.liquid` |

`main-cart-footer.liquid` is stock Dawn with one change: the plain order-note
textarea is replaced by a render of the gift-message snippet, still behind the
theme's own `show_cart_note` setting, so the block can be switched off from the
theme editor without touching code.

## What reaches the order

- `attributes[Gift card]` — `No card`, `A blank house card`, or `Write a message`
- `note` — the message itself, verbatim, capped at 180 characters

Both fields sit inside `form#cart`, so a shopper with JavaScript turned off
still carries them to checkout on submit. With JavaScript, each change is saved
to the cart as it is typed, so a refresh never loses a written message.

## Installing

Apply to an unpublished theme, preview the cart, then publish from the Shopify
admin. `Dawn — gift message 2026-09-14` is a duplicate of the live theme,
already waiting for these two files.
