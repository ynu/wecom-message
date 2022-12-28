import assert from 'assert';
import cache from 'memory-cache';
import { sendText, parseMessage, parseXmlToJson, WecomEventMessage } from '../index.mjs';

const {
  TEST_USERID, TEST_AGENTID, 
  CORP_ID, SECRET,
  TEST_ENCRYPT_MSG,
  TEST_MSG, TEST_ENCODING_AES_KEY,
} = process.env;
describe('wecom-message 测试', () => {
  after(() => cache.clear());
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
  describe('解析消息体测试', () => {
    it('parseMessage 解析接收到的加密消息', async () => {
      const res = await parseMessage(TEST_ENCRYPT_MSG, TEST_ENCODING_AES_KEY);
      assert.equal(res.Content, 'hello');
    });
    it('parseXmlToJson 解析XML消息块', async () => {
      const res = await parseXmlToJson(TEST_MSG);
      assert.equal(res.ApprovalInfo.SpNo, '202212280011');
      assert.equal(res.ApprovalInfo.SpRecord[0].Details[0].Approver.UserId, 'na57');
      assert.equal(res.ApprovalInfo.Comments[0].CommentUserInfo.UserId, 'na57');
    });
  });
  describe('WecomEventMessage 测试', () => {
    it('消息解析测试', () => {
      const json = '{"ToUserName":["wx755f7"],"FromUserName":["sys"],"CreateTime":["1667046500"],"MsgType":["event"],"Event":["sys_approval_change"],"AgentID":["14"],"ApprovalInfo":[{"SpNo":["202210290046"],"SpName":["测试"],"SpStatus":["2"],"TemplateId":["C4NyrHsrYZniRS9QLBUsyTs61RP1NgwxB3vXrBvmd"],"ApplyTime":["1667045909"],"Applyer":[{"UserId":["na57"],"Party":["3004"]}],"SpRecord":[{"SpStatus":["2"],"ApproverAttr":["1"],"Details":[{"Approver":[{"UserId":["na57"]}],"Speech":[""],"SpStatus":["2"],"SpTime":["1667046500"]}]}],"StatuChangeEvent":["2"]}]}';
      const msg = new WecomEventMessage(JSON.parse(json));
      assert.equal(msg.ToUserName, 'wx755f7');
      assert.equal(msg.ApprovalInfo.SpNo, '202210290046');
      assert.equal(msg.spStatusToText(), '已通过');
      
    });
  });
});