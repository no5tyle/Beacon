# Privacy

Beacon is an unofficial helper for Scouts Australia leaders and youth members that works with your Terrain account. It is not made or endorsed by Scouts Australia. This statement explains everything Beacon does with information about you and the youth members in your unit.

## The short version

- Beacon has no server, database, user accounts, analytics, tracking, cookies or advertising. It runs entirely in your browser.
- Beacon talks only to Terrain: Terrain's login service and Terrain's own addresses at terrain.scouts.com.au.
- Your password goes only to Terrain's login service and is never saved. Your login is held in your browser's memory and is gone when you close or reload Beacon.
- Information about youth members is loaded from Terrain when you need it, held in memory while Beacon is open, and never saved on your device, unless you choose to download a log (see [Logging](#logging)).
- Beacon keeps a few preferences on your device, such as your branch, your chosen unit and your starred Reference statements. They are all listed [below](#what-beacon-keeps-on-your-device).

## Logging in

You enter your branch, member number and password. Beacon sends them directly to Terrain's login service (cognito-idp.ap-southeast-2.amazonaws.com), the same service Terrain's own website uses.

The login service sends back login tokens. Beacon keeps them in your browser's memory only, uses them to load and save information in Terrain, and renews them while you use Beacon. They are never saved to your device. Closing or reloading Beacon, or choosing Logout, discards them.

If your password manager fills in the login form, Beacon may log in by itself. The diagnostics shown when you tap the version line record which field events happened and how long the fields are, never what you typed. They are shown on screen only and are not kept.

## What Beacon loads from Terrain

Depending on the page you use, Beacon loads:

- **Your profiles:** your name, member number, groups, units and roles, and the email address on your Terrain account.
- **Your unit's members:** names, member numbers, dates of birth, patrols, roles and Unit Council membership.
- **Each youth member's achievements:** Outdoor Adventure Skills stages and their statements, milestones and the activities counted towards them, introductions, special interest area projects, and peak award parts.
- **Logbook totals**, such as kilometres hiked and nights camped.
- **Your units' approvals lists:** for each of your units whose Unit Council you're on, submissions waiting for the Unit Council (with the names of any special interest area projects among them, read from those youth's projects), and on the History tab those it has finished with, each with the youth's name, the achievement, when it was submitted and decided, the outcome, and the names of Unit Council members who voted on it.
- **Terrain's public OAS templates:** the statements and explanations for each stage. These need no login and contain nothing about any member.

All of this goes from Terrain straight to your browser. Beacon uses it to show its pages, and forgets it when you close or reload Beacon, log out, or choose a different unit. Beacon never sends it anywhere except back to Terrain, as described in the next section.

Beacon can see and change only what Terrain allows your account to. A youth member logged in to Beacon sees only their own progress.

## What Beacon changes in Terrain

Beacon changes something in Terrain only when you choose to record OAS statements, submit a stage for review, approve or award a submission, or add an activity to a unit's programme. When you record or submit:

- Terrain accepts these changes only from the youth member's own profile. Beacon asks Terrain to let you act as that youth for the change, as leaders do in Terrain, and switches back straight afterwards.
- The statements you ticked are added to the youth's OAS record, with the verifier's name, email or phone, and the date. The verifier details start as your own name and the email address on your Terrain account, and you can change them before saving. They become part of the youth's record in Terrain, where the youth, their leaders and Scouts Australia can see them, just as when statements are verified in Terrain itself.
- When you submit a stage for review, Terrain records you as the leader who submitted it.

When you approve a submission on the Approvals page, Beacon sends your approval to Terrain as yourself, as a Unit Council member, exactly as Terrain's own Approvals tab does. Terrain records your name against the submission, where other Unit Council members and the unit's leaders can see it. When you save an activity from Log activity, Beacon adds it to the unit's programme in Terrain, as yourself, exactly as Terrain's own activity planner does: its title, dates, place and challenge area, and the youth you marked as attending with their roles. Terrain records you as its organiser and verifier, where the unit's leaders and those youth can see it. Log activity takes only activities that are over, and straight away concludes each with the review you give (how it went, what it was like, the Scout method it used and the SPICES it developed), as Terrain does, which gives those who came credit for it.

When your approval sends a youth's special interest area plan through, Beacon can also move the project on to its review for them, as the youth would in Terrain. You choose this with a box in the confirm, ticked unless you untick it. Like recording, this is done as the youth: Beacon re-saves the plan exactly as it stands, changing none of its answers.

When a submission the Unit Council has approved is ready to award, Beacon can award it the same way, as yourself, with the date you choose. Terrain records your name and that date against the youth's achievement. Beacon only offers approving and awarding where Terrain says you may, and asks you to confirm first.

Beacon never removes or changes anything already recorded in Terrain.

## What Beacon keeps on your device

Beacon keeps these in your browser's storage for its website until you clear your browser's data for the site:

| What                                                                      | Why                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| Your branch                                                               | Filled in next time you log in                 |
| The unit you last chose (Terrain's id for it)                             | Chosen for you next time                       |
| Focus youth picked on Insights (Terrain's ids for those youth, not names) | So Insights keeps tracking them, for each unit |
| Starred Reference statements                                              | Your starred list                              |
| When you last saved the Reference for offline use                         | Shown in the Beacon Reference app              |
| Whether Beacon is installed, and whether you dismissed the install hint   | So the hint isn't shown again                  |

Insights' filter settings are kept in your browser tab's session storage, and are cleared when you close the tab.

None of these is your password, a login token, or a youth member's name, details or progress.

For use without signal, Beacon keeps its own app files in your browser's cache, and, if you choose "Save everything for offline" in the Beacon Reference app, Terrain's public OAS templates. None of these contains information about any member.

Older versions of Beacon kept each unit's approvals list, including youth names and achievements, in the browser's storage. Beacon now removes any it finds whenever it opens.

## Logging

The Logging page can record Beacon's requests to Terrain, to help solve a problem. Logging is off unless you turn it on. The log is held in memory until you download it, and is lost if you close Beacon first.

The log records the address of each request and Terrain's response. Responses can include youth members' names, member numbers, dates of birth and progress. Requests to Terrain's login service are recorded without their contents, so the log never contains your password or login tokens.

Once downloaded, the log is a file on your device and you decide who it goes to. Treat it like any other record of youth members' information: send it only to the person helping you, and delete it once the problem is solved.

## Sharing and printing

Links shared from the Reference contain only the filters or the statement you're sharing, never anything about a member. Sharing uses your phone's share sheet, or copies the link to your clipboard where sharing isn't available. Printing goes through your browser and printer, like any web page.

## Where Beacon is hosted

Beacon's files are hosted on GitHub Pages. Like any website host, GitHub receives the usual information about each visit, such as your IP address and browser, when your browser downloads Beacon's files. GitHub receives nothing you see or enter in Beacon. [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) covers what it collects. Beacon loads nothing from any other website.

## Terrain's own privacy policy

Terrain, its login service and the information in them are run by Scouts Australia under its own privacy policy. Beacon doesn't change how Terrain stores or uses information. It only reads and writes what you could read and write in Terrain yourself.

## Looking after youth members' information

Beacon shows youth members' personal information on your screen. Follow your branch's privacy and child safe policies when you use it: don't leave Beacon open on a shared device, take care with screenshots and printouts, and handle downloaded logs as described above.

## Questions

Beacon is open source, so anyone can check what it does at [github.com/no5tyle/Beacon](https://github.com/no5tyle/Beacon). Raise any questions or concerns as an issue there.
