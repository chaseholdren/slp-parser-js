import * as lodash from 'lodash';
import { iterateFramesInOrder, isDead, didLoseStock, StockType } from './common';
import { PostFrameUpdateType } from '../utils/slpReader';
import { default as SlippiGame } from '../SlippiGame';

export function generateStocks(game: SlippiGame): StockType[] {
  const stocks: StockType[] = [];
  const frames = game.getFrames();

  const initialState: {
    stock?: StockType;
  } = {
    stock: undefined,
  };

  let state = initialState;

  // Iterates the frames in order in order to compute stocks
  iterateFramesInOrder(
    game,
    () => {
      state = { ...initialState };
    },
    (indices, frame) => {
      const playerFrame = frame.players[indices.playerIndex].post;
      const prevPlayerFrame: PostFrameUpdateType = lodash.get(
        frames,
        [playerFrame.frame! - 1, 'players', indices.playerIndex, 'post'],
        {},
      );

      // If there is currently no active stock, wait until the player is no longer spawning.
      // Once the player is no longer spawning, start the stock
      if (!state.stock) {
        const isPlayerDead = isDead(playerFrame.actionStateId!);
        if (isPlayerDead) {
          return;
        }

        state.stock = {
          playerIndex: indices.playerIndex,
          opponentIndex: indices.opponentIndex,
          startFrame: playerFrame.frame!,
          endFrame: undefined,
          startPercent: 0,
          endPercent: undefined,
          currentPercent: 0,
          count: playerFrame.stocksRemaining!,
          deathAnimation: undefined,
        };

        stocks.push(state.stock);
      } else if (didLoseStock(playerFrame, prevPlayerFrame)) {
        state.stock.endFrame = playerFrame.frame!;
        state.stock.endPercent = prevPlayerFrame.percent || 0;
        state.stock.deathAnimation = playerFrame.actionStateId!;
        state.stock = undefined;
      } else {
        state.stock.currentPercent = playerFrame.percent || 0;
      }
    },
  );

  return stocks;
}
