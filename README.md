# Stash Ledger

A fan-made keep/sell guide for **The Forever Winter**.

Current version: **v1.08** · Live page: https://winter-scav-tools.github.io/stash-ledger/

- **Keep or sell:** tick the Innards upgrades you've built and the story quests you've finished. Keep counts drop as you go, and items flip to *Sell now* once nothing needs them.
- **Raid planner:** pick an upgrade or quest as your goal to see what it still needs and which map has the most of it. Enter how many of each item you already have (or tick "got all") and it only counts what's still missing. Or skip the goal and tick maps to browse what's worth grabbing there.
- **Raid Loadout:** your raid goal also shows up in the [Raid Loadout](https://winter-scav-tools.github.io/raid-loadout/), which works out what to pack and keeps room in your rig for it.
- **Story quests in order:** grouped by chain, with who gives each one.
- **Spoiler-free mode:** blurs quest names, bosses and secret spots. Tap a blurred name to peek.
- **Colorblind mode:** swaps red and amber for yellow and blue.
- **Value per space:** credits per unit of rig space, for deciding what to drop when your rig is full.

Rows marked **?** are unverified. If you check one in-game and it's wrong, open an issue.

Progress is saved in your own browser. To keep it the same on your phone and PC, turn on **Sync** in the Innards log, or use *Back up or move progress* there.

## Sync

Sync is optional and off until you turn it on.

- **No account.** Turning it on gives you a random sync code. Type that code on your other device to connect it. Anyone with the code can see and change your progress, so keep it to yourself.
- **What's stored:** only your ticks, goal, Have counts and settings (plus your Raid Loadout plan, if you use it: one code syncs both tools), on Cloudflare's free tier. Nothing personal. The server keeps a scrambled (hashed) form of your code, never the code itself, and doesn't keep request logs.
- **Deleted after 6 months unused:** a save nobody opens or changes for 180 days is removed automatically.
- **Delete it yourself:** *Delete synced data* in the sync box (tap twice) removes your save right away. Your progress on the device stays.

The server code is in [`sync/`](sync/).

## Credits

**Made by scavs, for scavs.** Part of [Winter Scav Tools](https://github.com/winter-scav-tools), fan-made tools for The Forever Winter. Its sister tool, [Raid Loadout](https://winter-scav-tools.github.io/raid-loadout/), works out what to pack for a raid and picks up your raid goal from this page.

**How it's made.** Built by NotBlind Media with help from Claude, an AI. The AI writes the code and pulls the numbers from the wiki, which is how one fan can keep this up to date after every patch. The data itself comes from the wiki's human editors, players check it in-game (that's what the **?** marks are for), and there's no AI art anywhere on the page.

Unofficial fan-made tool. Not affiliated with or endorsed by Fun Dog Studios. Item icons © Fun Dog Studios, used with their permission for this free tool; see [icons/CREDITS.md](icons/CREDITS.md). Everything else is fan-made.

Like the game? Support the devs: [Steam](https://store.steampowered.com/app/2828860/The_Forever_Winter/) · [Epic Games Store](https://store.epicgames.com/en-US/p/the-forever-winter-8b8280) · [Fun Dog Studios](https://www.fundogstudios.com/)

Item, quest, upgrade and spawn data comes from [The Forever Winter Wiki](https://theforeverwinter.wiki.gg/) and is shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The data in this page is shared under the same license. Built by NotBlind Media with Claude.


## License

The code is licensed under [GPL-3.0](LICENSE): you can copy and change it, but anything you publish from it has to stay open source under GPL-3.0 too. The wiki data is CC BY-SA 4.0 (see Credits). The license only covers this project's own code; The Forever Winter and everything in it belong to Fun Dog Studios.

The item icons in icons/ are not covered by GPL-3.0: they belong to Fun Dog Studios and are used with their permission. Don't reuse them, and never in anything paid.
