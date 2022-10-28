import assert from 'assert';
import { sendText } from '../index.mjs';
// import axios from 'axios';

const {
  TEST_USERID, TEST_AGENTID, 
  CORP_ID, SECRET,
} = process.env;
describe('wecom-message 测试', () => {
  describe('send 发送消息测试', () => {
    it('sendText 发送文本消息测试', async () => {
      const res = await sendText({
        touser: TEST_USERID,
      }, TEST_AGENTID, 'test', {
        corpId: CORP_ID,
        secret: SECRET,
      });
      assert.equal(0, res.errcode);
    });
  });
});