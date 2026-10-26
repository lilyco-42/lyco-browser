# LYCO mobile subscription core

A source-built, in-process sing-box integration for browser environment traffic.
It provides a loopback HTTP listener with a single explicit remote outbound. It
does not install a device VPN, add a DIRECT fallback, accept arbitrary feed
inbounds/rules, or write node credentials and configurations to disk.

iOS listeners use random local credentials; closed listener ports stay reserved
until the app process ends. Android browser processes terminate on close.

Dependency: SagerNet/sing-box v1.14.4, source commit
c005f35300ce76427dc285481ec5695f5b179cd2. All builds and tests run in Actions.
The dependency is GPL-3.0-or-later; mobile distributions must retain its notices,
license and corresponding complete source/build instructions. This integration
is not yet wired into the native application until the routing/binding gates pass.
