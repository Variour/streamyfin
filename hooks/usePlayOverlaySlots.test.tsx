import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { usePlayOverlaySlots } from "./usePlayOverlaySlots";

const mockPlayItem = jest.fn();
let mockShowPlayOverlay = true;

jest.mock("@/hooks/usePlayItem", () => ({
  usePlayItem: () => mockPlayItem,
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: { showPlayOverlay: mockShowPlayOverlay } }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const movie: BaseItemDto = { Id: "m1", Type: "Movie", Name: "Movie" };
const series: BaseItemDto = { Id: "s1", Type: "Series", Name: "Series" };
const card = (id: string) => ({ id, title: id });

const Overlay = ({ id }: { id: string }) => {
  const slots = usePlayOverlaySlots([movie, series]);
  return <>{slots?.overlay?.(card(id))}</>;
};

describe("usePlayOverlaySlots", () => {
  beforeEach(() => {
    mockPlayItem.mockClear();
    mockShowPlayOverlay = true;
  });

  it("starts playback from the button without opening the details", async () => {
    await render(<Overlay id='m1' />);
    await fireEvent.press(screen.getByTestId("card-play-overlay"));
    expect(mockPlayItem).toHaveBeenCalledWith(movie);
  });

  it("draws no button on an item the player cannot open", async () => {
    await render(<Overlay id='s1' />);
    expect(screen.queryByTestId("card-play-overlay")).toBeNull();
  });

  it("draws no button while the setting is off", async () => {
    mockShowPlayOverlay = false;
    await render(<Overlay id='m1' />);
    expect(screen.queryByTestId("card-play-overlay")).toBeNull();
  });
});
