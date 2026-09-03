import {
	CheckIcon,
	LinkIcon,
	LogOutIcon,
	Volume2Icon,
	VolumeXIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip.tsx";

type RoomTopBarProps = {
	code: string;
	/** Left of the bar. Empty in the lobby, the turn clock during a game. */
	status?: React.ReactNode;
	/** Centre of the bar, and the only thing that ever sits there: the word. */
	banner?: React.ReactNode;
	onLeave?: () => void;
};

/**
 * The one strip of the room that is the same on every stage: what room this is,
 * how to invite someone to it, and how to leave. Whatever the stage wants to
 * say for itself goes in the two slots on the left and in the middle.
 */
export function RoomTopBar({ code, status, banner, onLeave }: RoomTopBarProps) {
	const [muted, setMuted] = useState(false);

	return (
		<header className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-card px-3 py-2 text-card-foreground ring-1 ring-foreground/10 sm:grid-cols-[1fr_auto_1fr]">
			<div className="col-start-1 row-start-1 flex min-w-0 items-center">
				{status}
			</div>

			{/*
				Dropped entirely rather than left empty: an empty middle cell would
				still claim a row of its own on a narrow screen, and push the bar
				taller than the stage below was measured against.
			*/}
			{banner ? (
				<div className="col-span-2 col-start-1 row-start-2 flex justify-center sm:col-span-1 sm:col-start-2 sm:row-start-1">
					{banner}
				</div>
			) : null}

			<div className="col-start-2 row-start-1 flex items-center justify-end gap-1 sm:col-start-3">
				<InviteButton code={code} />
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-pressed={muted}
							aria-label={muted ? "Unmute sounds" : "Mute sounds"}
							onClick={() => setMuted((on) => !on)}
						>
							{muted ? <VolumeXIcon /> : <Volume2Icon />}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{muted ? "unmute" : "mute"}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Leave the room"
							onClick={onLeave}
						>
							<LogOutIcon />
						</Button>
					</TooltipTrigger>
					<TooltipContent>leave room</TooltipContent>
				</Tooltip>
			</div>
		</header>
	);
}

/** Room code that copies a join link to the clipboard when clicked. */
function InviteButton({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);

	// Reset the tick a moment after the copy so the button settles back.
	useEffect(() => {
		if (!copied) return;
		const id = setTimeout(() => setCopied(false), 1600);
		return () => clearTimeout(id);
	}, [copied]);

	async function copy() {
		await navigator.clipboard.writeText(window.location.href);
		setCopied(true);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="ghost" size="sm" onClick={copy}>
					{copied ? (
						<CheckIcon data-icon="inline-start" className="text-primary" />
					) : (
						<LinkIcon data-icon="inline-start" />
					)}
					<Badge variant="outline" className="tracking-[0.2em] uppercase">
						{code}
					</Badge>
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				{copied ? "link copied" : "copy invite link"}
			</TooltipContent>
		</Tooltip>
	);
}
