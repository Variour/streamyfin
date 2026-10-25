import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { TouchableOpacity } from "react-native";
import {
  PLAY_OVERLAY_BACKGROUND,
  PLAY_OVERLAY_HIT_SLOP,
  PLAY_OVERLAY_ICON_COLOR,
  PLAY_OVERLAY_INSET,
  PLAY_OVERLAY_SIZE,
} from "@/constants/PlayOverlay";

/**
 * A round Play button in the top left corner of a card's artwork, for
 * `CardSlots.overlay`. It takes its own presses; the rest of the card still
 * opens the details.
 */
export const CardPlayOverlay: React.FC<{ onPress: () => void }> = ({
  onPress,
}) => {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      testID='card-play-overlay'
      onPress={onPress}
      hitSlop={PLAY_OVERLAY_HIT_SLOP}
      accessibilityRole='button'
      accessibilityLabel={t("accessibility.play_button")}
      style={{
        position: "absolute",
        top: PLAY_OVERLAY_INSET,
        left: PLAY_OVERLAY_INSET,
        width: PLAY_OVERLAY_SIZE,
        height: PLAY_OVERLAY_SIZE,
        borderRadius: PLAY_OVERLAY_SIZE / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PLAY_OVERLAY_BACKGROUND,
      }}
    >
      <Ionicons
        name='play'
        size={PLAY_OVERLAY_SIZE * 0.5}
        color={PLAY_OVERLAY_ICON_COLOR}
        // The triangle's centre of mass sits left of its box.
        style={{ marginLeft: 2 }}
      />
    </TouchableOpacity>
  );
};
