import { useActionSheet } from "@expo/react-native-action-sheet";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, View } from "react-native";
import CastContext, {
  PlayServicesState,
  useCastDevice,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import type { SelectedOptions } from "@/components/ItemContent";
import { RECEIVER_LOAD_TIMEOUT_MS } from "@/constants/Cast";
import { useHaptic } from "@/hooks/useHaptic";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { getDownloadedItemById } from "@/providers/Downloads/database";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import {
  castToJellyfinReceiver,
  currentReceiverName,
  receiverNameFor,
} from "@/utils/cast/jellyfinReceiver";
import { castNotStartedMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { formatDuration } from "@/utils/time";

/**
 * The Play action of an item: resume prompt, downloaded-copy prompt and
 * Chromecast choice, then the player. Without `selectedOptions` the server
 * picks the streams. Shared by the item page's Play button and the Play
 * overlay on home cards, so one row needs one instance, not one per card.
 */
export const usePlayItem = () => {
  const isOffline = useOfflineMode();
  const { showActionSheetWithOptions } = useActionSheet();
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const mediaStatus = useMediaStatus();
  const { t } = useTranslation();
  const { showModal, hideModal } = useGlobalModal();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const lightHapticFeedback = useHaptic("light");
  const playMedia = usePlayMedia();

  const handleNormalPlayFlow = useCallback(
    async (
      item: BaseItemDto,
      selectedOptions: Partial<SelectedOptions>,
      positionTicks: number,
    ) => {
      if (!item) return;

      const playRequest: PlayRequest = {
        itemId: item.Id!,
        audioIndex: selectedOptions.audioIndex,
        subtitleIndex: selectedOptions.subtitleIndex,
        mediaSourceId: selectedOptions.mediaSource?.Id ?? undefined,
        bitrateValue: selectedOptions.bitrate?.value,
        offline: isOffline,
        playbackPositionTicks: positionTicks,
      };

      if (!client) {
        await playMedia(playRequest, { item });
        return;
      }

      const options = ["Chromecast", "Device", "Cancel"];
      const cancelButtonIndex = 2;
      showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
        },
        async (selectedIndex: number | undefined) => {
          if (!api) return;
          const currentTitle = mediaStatus?.mediaInfo?.metadata?.title;
          const isOpeningCurrentlyPlayingMedia =
            currentTitle && currentTitle === item?.Name;

          switch (selectedIndex) {
            case 0:
              await CastContext.getPlayServicesState().then(async (state) => {
                if (state && state !== PlayServicesState.SUCCESS) {
                  CastContext.showPlayServicesErrorDialog(state);
                } else {
                  // Validate required parameters before casting
                  if (!api) {
                    console.warn("API not available for Chromecast streaming");
                    Alert.alert(
                      t("player.client_error"),
                      t("player.missing_parameters"),
                    );
                    return;
                  }
                  if (!user?.Id) {
                    console.warn(
                      "User not authenticated for Chromecast streaming",
                    );
                    Alert.alert(
                      t("player.client_error"),
                      t("player.missing_parameters"),
                    );
                    return;
                  }
                  if (!item?.Id) {
                    console.warn("Item not available for Chromecast streaming");
                    Alert.alert(
                      t("player.client_error"),
                      t("player.missing_parameters"),
                    );
                    return;
                  }

                  // The official Jellyfin receiver negotiates playback on its
                  // own: it is handed the item plus the chosen streams and runs
                  // PlaybackInfo itself, which is what opens a real Jellyfin
                  // session and makes the cast visible in the dashboard. No
                  // stream URL, device profile or sidecar subtitle track is
                  // built here any more -- the receiver handles all of it.
                  if (!client) return;
                  try {
                    const outcome = await castToJellyfinReceiver(
                      client,
                      {
                        api,
                        userId: user.Id,
                        receiverName:
                          (await currentReceiverName()) ??
                          receiverNameFor(castDevice),
                        maxBitrate: selectedOptions.bitrate?.value,
                      },
                      {
                        items: [item],
                        startPositionTicks: positionTicks,
                        mediaSourceId:
                          selectedOptions.mediaSource?.Id ?? undefined,
                        audioStreamIndex: selectedOptions.audioIndex,
                        subtitleStreamIndex: selectedOptions.subtitleIndex,
                      },
                      RECEIVER_LOAD_TIMEOUT_MS,
                    );

                    const notStarted = castNotStartedMessage(t, outcome);
                    if (notStarted) {
                      writeErrorLog("Chromecast did not start", outcome);
                      Alert.alert(t("player.client_error"), notStarted);
                    } else if (
                      outcome.status === "loaded" &&
                      // state is already set when reopening current media, so skip it here.
                      !isOpeningCurrentlyPlayingMedia
                    ) {
                      CastContext.showExpandedControls();
                    }
                  } catch (e) {
                    logAndCaptureError("Chromecast playback failed", e);
                    Alert.alert(
                      t("player.client_error"),
                      t("player.chromecast_playback_failed"),
                    );
                  }
                }
              });
              break;
            case 1:
              await playMedia(playRequest, { item });
              break;
            case cancelButtonIndex:
              break;
          }
        },
      );
    },
    [
      client,
      castDevice,
      api,
      user,
      showActionSheetWithOptions,
      mediaStatus,
      playMedia,
      isOffline,
      t,
    ],
  );

  const startPlayback = useCallback(
    async (
      item: BaseItemDto,
      selectedOptions: Partial<SelectedOptions>,
      positionTicks: number,
    ) => {
      if (!item) return;

      // Check if item is downloaded
      const downloadedItem = item.Id
        ? getDownloadedItemById(item.Id)
        : undefined;

      // If already in offline mode, play downloaded file directly
      if (isOffline && downloadedItem) {
        await playMedia(
          {
            itemId: item.Id!,
            offline: true,
            playbackPositionTicks: positionTicks,
          },
          { item },
        );
        return;
      }

      // If online but file is downloaded, ask user which version to play
      if (downloadedItem) {
        if (Platform.OS === "android") {
          // Show bottom sheet for Android
          showModal(
            <BottomSheetView>
              <View className='px-4 mt-4 mb-12'>
                <View className='pb-6'>
                  <Text className='text-2xl font-bold mb-2'>
                    {t("player.downloaded_file_title")}
                  </Text>
                  <Text className='opacity-70 text-base'>
                    {t("player.downloaded_file_message")}
                  </Text>
                </View>
                <View className='space-y-3'>
                  <Button
                    onPress={() => {
                      hideModal();
                      void playMedia(
                        {
                          itemId: item.Id!,
                          offline: true,
                          playbackPositionTicks: positionTicks,
                        },
                        { item },
                      );
                    }}
                    color='purple'
                  >
                    {Platform.OS === "android"
                      ? "Play downloaded file"
                      : t("player.downloaded_file_yes")}
                  </Button>
                  <Button
                    onPress={() => {
                      hideModal();
                      handleNormalPlayFlow(
                        item,
                        selectedOptions,
                        positionTicks,
                      );
                    }}
                    color='white'
                    variant='border'
                  >
                    {Platform.OS === "android"
                      ? "Stream file"
                      : t("player.downloaded_file_no")}
                  </Button>
                </View>
              </View>
            </BottomSheetView>,
            {
              snapPoints: ["35%"],
              enablePanDownToClose: true,
            },
          );
        } else {
          // Show alert for iOS
          Alert.alert(
            t("player.downloaded_file_title"),
            t("player.downloaded_file_message"),
            [
              {
                text: t("player.downloaded_file_yes"),
                onPress: () => {
                  void playMedia(
                    {
                      itemId: item.Id!,
                      offline: true,
                      playbackPositionTicks: positionTicks,
                    },
                    { item },
                  );
                },
                isPreferred: true,
              },
              {
                text: t("player.downloaded_file_no"),
                onPress: () => {
                  handleNormalPlayFlow(item, selectedOptions, positionTicks);
                },
              },
              {
                text: t("player.downloaded_file_cancel"),
                style: "cancel",
              },
            ],
          );
        }
        return;
      }

      // If not downloaded, proceed with normal flow
      handleNormalPlayFlow(item, selectedOptions, positionTicks);
    },
    [isOffline, handleNormalPlayFlow, playMedia, t, showModal, hideModal],
  );

  const playItem = useCallback(
    (item: BaseItemDto, selectedOptions: Partial<SelectedOptions> = {}) => {
      if (!item) return;

      lightHapticFeedback();

      // Same prompt the TV item page shows: an in-progress item asks whether
      // to resume or restart instead of silently resuming. Users can turn the
      // prompt off in settings, in which case playback resumes right away.
      const progressTicks = item.UserData?.PlaybackPositionTicks ?? 0;
      if (progressTicks > 0 && !settings.showResumeDialog) {
        void startPlayback(item, selectedOptions, progressTicks);
        return;
      }
      if (progressTicks > 0) {
        Alert.alert(
          t("item_card.resume_playback"),
          t("item_card.resume_playback_description"),
          [
            {
              text: t("common.cancel"),
              style: "cancel",
            },
            {
              text: t("item_card.play_from_start"),
              onPress: () => void startPlayback(item, selectedOptions, 0),
            },
            {
              text: t("item_card.continue_from", {
                time: formatDuration(progressTicks),
              }),
              onPress: () =>
                void startPlayback(item, selectedOptions, progressTicks),
              isPreferred: true,
            },
          ],
        );
        return;
      }

      void startPlayback(item, selectedOptions, 0);
    },
    [lightHapticFeedback, startPlayback, t, settings.showResumeDialog],
  );

  return playItem;
};
