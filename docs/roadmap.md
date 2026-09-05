# Roadmap

Designed, not built. Each of these was worked through in detail before being set
down; none has been started. They are listed roughly in the order they are worth
taking, which is not the order they were numbered.

Nothing here is a promise. If you want one of them, say so on an issue: knowing
somebody wants it is what moves it up.

## Keeping every budget revision

Setout exists to replace a spreadsheet whose budget figures were typed in after
the money was spent. `BudgetItem` half-remembers this: it carries a `set_at`
field for when the number was last set on purpose. But updating a planned amount
overwrites the old one, so the previous figure is gone and there is no way to
show that a budget was raised to meet the spend rather than the other way round.
Keeping every revision closes the loop the whole application is built around,
which is why it is worth taking first.

## Saying so when a price has jumped

Setout already knows what everything used to cost: item price history is
computed from the expenses, and the add-expense form shows the last price paid.
What it does not do is speak up. Paying 7,650 a bag when the last three were
4,500 is recorded without comment. Catching an overcharge while you are still
standing in front of the seller is worth more than a report a month later. The
data path already exists end to end; what is missing is a sentence at the right
moment.

## Settling up with whoever is holding your money

Advances record money handed to somebody before they spend it, and the balance
calculation says where that leaves them: holding your money, or out of pocket
and owed it back. What is missing is the closing move. There is no way to record
cash handed back, so a balance can only be worked down by spending it, never
squared off. The number drifts, and there is nothing to show the person when you
sit down to count.

## Warning on a plot page that the pin is nowhere near its address

Setting a pin on the land form already asks the geocoder what it calls that spot,
and says so when the town, state or country disagrees with what the plot records.
Opening a plot says nothing: the check runs where the pin is moved, not where it
is read.

The awkward part is that the record does not hold enough to repeat the check. The
address the geocoder gave is stored, but not the town, state and country the
comparison actually needs, so a plot page would have to ask again on every view.
That is cheap in practice, because answers are cached per coordinate on the
server, but it means opening a plot makes a request that opening a plot does not
otherwise make.

The alternative is keeping the town, state and country beside the address, so the
check needs nothing at all. It costs three columns, and they quietly go stale the
day somebody corrects a plot's town without touching its pin — a stored answer to
a question nobody asked again.

The pin-outside-the-boundary warning already shows in both places, because that
one is arithmetic on what the page has in hand.

## Vendors and people tabs on a project

Vendors and people are install-wide, and the only way to see them today is the
global lists. From inside a project you cannot answer "who have I been paying on
this build, and how much", the question somebody standing on the site actually
asks. The reverse cut already ships: a vendor's spend is broken down per project.
This is the transpose, surfaced as two more tabs. Nothing new is stored.

## Project analytics

The project screen answers how much is planned, how much is spent, and how far
off you are. It cannot answer why. Where the money is actually going, whether
the rate of spending is sustainable, and which parts of the plan were wrong.
Budget items and expenses already carry a cost type (labour, material, fixed)
and nothing reads it back yet, which makes it the cheapest missing cut.

## Capturing spend with no signal

The add-expense screen was built to be used one handed on a phone at the
merchant's counter. A building site is exactly where the signal is not, and today
a lost connection means a lost entry: the form posts or it fails. There is no
service worker, nothing is cached or queued, and the app does not open at all
without the server. For an application whose point is catching spend at the
moment it happens, this is the widest gap left.

## A mobile app

The web app is already built for a phone: the add-expense screen works one
handed on a 360px screen, and it is where the app is actually used, standing at
a counter with a receipt in the other hand. What the browser cannot give it is
the camera one tap away, a share target so a photographed receipt can be sent
straight to a project, a home screen icon that opens instantly, and a push when
somebody holding your cash is running low.

The first step is not a separate codebase. Offline capture above brings a
service worker and a queue, which is most of what makes the web app installable;
adding a manifest and treating it as a progressive web app buys the icon, the
launch and the camera on both Android and iOS for a fraction of the cost. A
native build, sharing the generated SDK, only earns its place if push and
background upload turn out to matter more than that.

Either way the API stays as it is. Setout is self-hosted, so an app store build
would have to ask which server it is talking to before anything else, and that
question is worth designing before writing any of it.

## Signing in through an OpenID Connect provider

Setout authenticates one person with one passphrase. This would let an operator
point it at their own provider (Keycloak, Authentik, Auth0, Google) and let
each external identity become its own account. The second half is the real
point: it is the groundwork for proper multi-account support rather than a second
door to the same single account. It changes the shape of authentication, so it
should not be picked up before the smaller product work above.

## More than one person, with roles

Setout assumes one person: one account, one passphrase, no roles anywhere. A
build is rarely run alone. The site manager records spend, the person holding the
cash needs to see their own balance, and whoever is paying for the house wants
the figures without being able to rewrite the budget.

That means accounts as a real concept rather than a single row, an invitation
flow, and a small set of roles with the budget as the line that matters: owner
sets budgets and manages people, editor records spend and manages vendors,
viewer reads and exports. It also means every list and total becomes a question
of who is asking, and that soft deletes and the record export need to say who did
what.

This is the largest item here and it touches nearly every endpoint. It shares its
foundation with the OpenID Connect work above: both need identity to stop being
`User.first()`. Whichever is taken first should build that part properly for the
other.
