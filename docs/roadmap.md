# Roadmap

Designed but not built. Each was worked through in detail before being written down. None has been started. They are listed roughly in priority order.

Nothing here is a commitment. If you want one of these, open an issue. Requests raise an item's priority.

## Budget revision history

Setout exists to replace a spreadsheet whose budget figures were entered after the money was spent. `BudgetItem` carries a `set_at` field recording when the amount was last set. Updating a budgeted amount overwrites the previous one, so there is no way to show that a budget was raised to match spending rather than the reverse. Keeping every revision is the highest priority item here.

## Price increase warnings

Setout already stores past prices: item price history is
calculated from the expenses, and the add-expense form shows the last price paid.
It does not show a warning. Paying 7,650 a bag when the last three were 4,500 is recorded without one. Catching an overcharge at the point of purchase is more useful than a report a month later. The data is already available; only the warning is missing.

## Settling advances

Advances record money paid to a person before they make purchases, and the balance
shows the result: positive when the person holds unspent money, negative when they spent
their own money and you owe them the difference. There is no way to record money returned, so a balance can only
be reduced by spending, never settled. Over time the balance becomes inaccurate, and
there is no statement to review with the person when reconciling.

## Address warning on the land page

Setting a pin on the land form already looks up the address at that point,
and shows a warning when the town, state or country differs from the land record.
Opening a land record shows no warning: the check runs when the pin is moved, not when the
record is viewed.

The difficulty is that the record does not store enough to repeat the check. The
address returned by the geocoder is stored, but not the town, state and country the
comparison needs, so the land page would have to query again on every view.
That costs little in practice, because results are cached per coordinate on the
server, but it adds a request to every land page view.

The alternative is storing the town, state and country with the address, so the
check needs no request. It adds three columns, and they become outdated when someone corrects a land record's town without moving its pin.

The pin-outside-the-boundary warning already shows in both places, because it is
calculated from data the page already has.

## Vendors and people tabs on a project

Vendors and people are shared by the whole installation, and they are only shown in the
global lists. From inside a project you cannot see which vendors and people were paid on
this project, and how much. The reverse already exists: a vendor's expenses are broken down per project.
This adds the project view as two more tabs. Nothing new is stored.

## Project analytics

The project screen shows how much is budgeted, how much is spent, and the difference.
It does not show the causes: which categories the money is spent on, whether
the rate of spending is sustainable, and which parts of the budget were inaccurate.
Budget items and expenses already store a cost type (labour, material, fixed)
and no report uses it yet, which makes it the simplest report to add.

## Recording expenses offline

The add-expense screen is designed for one-handed use on a phone at the
point of purchase. Building sites often have no mobile signal, and currently
a lost connection means a lost entry: the form is submitted or it fails. There is no
service worker, nothing is cached or queued, and the app does not open at all
without the server. For an application whose purpose is recording each expense at the
time of purchase, this is the largest missing feature.

## A mobile app

The web app is already designed for a phone: the add-expense screen can be used
one-handed on a 360px screen, which is how the app is mostly used. The browser
cannot provide direct camera access, a share target so a photographed receipt can be sent
to a project, a home screen icon that opens immediately, or a push notification when
a person's advance balance is low.

The first step is not a separate codebase. Offline recording above adds a
service worker and a queue, which is most of what makes the web app installable;
adding a manifest and making it a progressive web app provides the icon, the
launch and the camera on both Android and iOS at much lower cost. A
native build, sharing the generated SDK, is only justified if push notifications and
background upload prove more important than that.

Either way the API stays as it is. Setout is self-hosted, so an app store build
would first have to ask which server to connect to, and that step should be
designed before any of the app is written.

## Signing in through an OpenID Connect provider

Setout authenticates one person with one passphrase. This would let an operator
point it at their own provider (Keycloak, Authentik, Auth0, Google) and let
each external identity become its own account. The second part is the most important: it is the basis for multi-account support, not another way to sign in to the same single account. It changes the shape of authentication, so it
should not be picked up before the smaller product work above.

## More than one person, with roles

Setout assumes one person: one account, one passphrase, no roles anywhere. A project is rarely run by one person. The site manager records expenses, a person who has received an advance needs to see their own balance, and the person funding the project needs to see the figures without being able to change the budget.

That means accounts as a real concept rather than a single row, an invitation
flow, and a small set of roles, with the budget as the dividing line: owner sets budgets and manages people, editor records expenses and manages vendors, viewer reads and exports. It also means every list and total depends on the signed-in user, and that archiving and the backup need to record which user made each change.

This is the largest item here and it affects nearly every endpoint. It shares its
foundation with the OpenID Connect work above: both need identity to stop being
`User.first()`. Whichever is built first should implement that part fully for the other.
