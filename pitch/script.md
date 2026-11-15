# EazyRoam: 3-minute pitch

**Live site:** https://<your-domain> · **Backup video:** record by 9:30 (PLAN.md §9)

## Script

**0:00 – 0:30 · The problem**
> For a wheelchair user without a car, "lunch, a gift, then a museum" isn't a plan. It's hours of research across several apps, and a backup plan for every stop. Many people give up and stay home, or wait for someone else to plan for them.

**0:30 – 1:15 · A normal map app**
- Type: *"Lunch, a birthday gift, then the art museum. Leave at 11, home by 6."* → Plan my day → **Compare**.
- Point at the left column: the top-rated lunch spot has steps at the door, a station on the route isn't step-free, and the museum closes before you'd finish.
> A normal map app answers one trip at a time and assumes every door is open to you.

**1:15 – 2:00 · EazyRoam**
- The right column, then **Back to my day**. Every stop is checked against Google Places and OpenStreetMap, every transit stop against GTFS through Transitland, and every sidewalk against wheelchair routing. Opening hours decide the order.
- Open a stop with no data: *"Accessibility unknown. Call ahead"*, with a backup ready.
> We'd rather tell you we don't know than give you a false green check.

**2:00 – 2:40 · Live re-plan**
- Tap **Something changed? → A ramp or entrance is blocked**, then pick a stop. The day re-plans and the new rows highlight. Gemini says what changed in one sentence.
- Mention: the report is saved, so the next person is routed around it (MongoDB Atlas), and elevator outages build a reliability history per station (Tiger Data). Boston stations use the MBTA's live elevator feed.

**2:40 – 3:00 · Close**
> Google Maps tells you whether one door is accessible. EazyRoam plans your whole day so that every door, every bus and every sidewalk is.

Independence, not convenience.

## Slides (5)
1. **Title:** EazyRoam, with the one-line pitch.
2. **The problem:** hours of research across several apps, for one day out.
3. **How it works:** a typed request → Gemini → candidate places (Places + OSM) → step-free legs (Routes + Transitland + ORS) → a planner that respects opening hours → re-planning.
4. **Built with:** Gemini · MongoDB Atlas · Tiger Data · Vultr · GoDaddy Registry. Real data, US-wide.
5. **Close:** the closing line + the live URL as a QR code.

## Before going on stage
- [ ] The live site works on the demo phone. Location permission granted, or a start address typed.
- [ ] Rehearsed the same request three times today, in Amherst and in Boston.
- [ ] Backup video is on the laptop's desktop.
- [ ] Wi-Fi fallback: phone hotspot.
