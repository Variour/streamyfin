import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo } from "react";
import { Platform } from "react-native";
import type { CardData, CardSlots } from "@/components/cards/CardData";
import { CardPlayOverlay } from "@/components/cards/CardPlayOverlay";
import { usePlayItem } from "@/hooks/usePlayItem";
import { useSettings } from "@/utils/atoms/settings";
import { isPlayableItem } from "@/utils/jellyfin/media/isPlayableItem";

/**
 * The card slots that put a Play button over the playable items of a row, or
 * undefined while `showPlayOverlay` is off. Pass the result to `CardRow`.
 */
export const usePlayOverlaySlots = (
  items: BaseItemDto[] | undefined,
): Pick<CardSlots, "overlay"> | undefined => {
  const { settings } = useSettings();
  const playItem = usePlayItem();
  const enabled = settings.showPlayOverlay && !Platform.isTV;

  return useMemo(() => {
    if (!enabled) return undefined;
    const itemById = new Map(items?.map((item) => [item.Id, item]));
    return {
      overlay: (card: CardData) => {
        const item = itemById.get(card.id);
        if (!item || !isPlayableItem(item)) return null;
        return <CardPlayOverlay onPress={() => playItem(item)} />;
      },
    };
  }, [enabled, items, playItem]);
};
