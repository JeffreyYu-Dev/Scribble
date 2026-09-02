"use client";

import { HoverCard as HoverCardPrimitive } from "radix-ui";

import { cn } from "#/lib/utils.ts";

function HoverCard({
	openDelay = 100,
	closeDelay = 150,
	...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
	return (
		<HoverCardPrimitive.Root
			data-slot="hover-card"
			openDelay={openDelay}
			closeDelay={closeDelay}
			{...props}
		/>
	);
}

function HoverCardTrigger({
	...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
	return (
		<HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
	);
}

function HoverCardContent({
	className,
	align = "center",
	sideOffset = 6,
	children,
	...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
	return (
		<HoverCardPrimitive.Portal>
			<HoverCardPrimitive.Content
				data-slot="hover-card-content"
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
					className,
				)}
				{...props}
			>
				{children}
				<HoverCardPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_1px)] rotate-45 rounded-[2px] border-r border-b bg-popover fill-popover" />
			</HoverCardPrimitive.Content>
		</HoverCardPrimitive.Portal>
	);
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
