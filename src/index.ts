import SlippiGame from "./SlippiGame";

export const getSlippiGameDataFromBuffer = async (arrayBuffer: ArrayBuffer) => {
    const game = new SlippiGame(arrayBuffer);
    const stats = game.getStats();
    const settings = game.getSettings();
    const metadata = game.getMetadata();

    return {
        stats,
        settings,
        metadata,
    };
};
