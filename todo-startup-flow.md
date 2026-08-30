# Startup flow todo

## 1. New game process
- Design the welcome screen and start flow
- Add the initial menu state: new game, load game, credits
- Hook Start New Game into the existing creation flow
- Keep the sequence clear and single-screen at first
- Confirm pressing Enter from the welcome screen opens the creation screen

## 2. Saving and loading
- Confirm how saves are stored and identified
- Add a save slot or quick-save flow
- Add a load menu that lists available saves
- Restore the latest or selected save back to the correct state
- Ensure the startup flow can differentiate new vs loaded game

## 3. Configurations
- Add a configuration screen or set of options
- Decide what settings belong here: audio, controls, screen size, maybe theme
- Keep the first pass minimal and stable
- Make sure configuration is accessible from the start menu and game menu

## 4. Credit popup
- Create a simple credits modal or overlay
- Include project title, team names, and short text
- Add a close action, likely Esc or Enter
- Ensure the popup is a separate lightweight screen so it does not disturb the rest of the flow

## Implementation order
1. New game process
2. Saving and loading
3. Configurations
4. Credit popup

## Notes
- Keep each screen separate and easy to test.
- The welcome screen is the first HTML screen; it establishes the visual system for the rest
	of the application.
- The startup flow needs browser routes or client-side views, not terminal window launchers.
- Build the GUI one screen at a time, starting with the welcome screen and then character
	creation.

## HTML GUI overhaul
- Replace the Ink client with a React HTML/CSS client served by Vite.
- Preserve the existing HTTP API and server-authoritative game rules.
- Establish the shared visual foundation first: typography, colors, spacing, focus states,
	responsive breakpoints, and accessible controls.
- Retire fixed terminal dimensions, ASCII branding, terminal-only keyboard handlers, and
	detached-console launch scripts from the active UI path.
- Add browser launch and production build checks before moving further screens.
