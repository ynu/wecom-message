/**
 * 企业微信API-接收和发送消息
 */
import axios from 'axios';
import xml2js from 'xml2js';
import { getToken, qyHost } from 'wecom-common';
import { decrypt } from '@wecom/crypto';
import Debug from 'debug';
const warn = Debug('wecom-message:warn');
const error = Debug('wecom-message:error');
const info = Debug('wecom-message:info');
const debug = Debug('wecom-message:debug');

const {
  ENCODING_AES_KEY, // 接收消息-EncodingAESKey
 } = process.env;
 

export class WecomMessage {
  constructor(json) {
    debug(`WecomMessage开始解析XmlJson数据::${JSON.stringify(json)}`);
    Object.assign(this, {
      ...json,
      ToUserName: json.ToUserName[0],
      FromUserName: json.FromUserName[0],
      CreateTime: parseInt(json.CreateTime[0], 10),
      MsgType: json.MsgType[0],
      MsgId: json.MsgId ? json.MsgId[0] : undefined,
      AgentID: json.AgentID ? json.AgentID[0] : undefined,
    });
    this.MsgTypeText = this.msgTypeToText();
  }
  msgTypeToText() {
    switch (this.MsgType) {
      case 'event':
        return '事件消息';
      case 'text':
        return '文本消息';
      default:
        return `未定义(${this.MsgType})`;
    }
  }
}

export class WecomTextMessage extends WecomMessage {
  constructor(json) {
    super(json);
    this.Content = json.Content[0];
  }
}

export class WecomEventMessage extends WecomMessage {
  constructor(json) {
    super(json);
    Object.assign(this, {
      ...this,
      Event: json.Event[0],
      EventKey: json.EventKey ? json.EventKey[0]: undefined,
    });
    this.EventText = this.eventToText();

    info(`WecomEventMessage按事件类型(Event字段)优化结构`);

    switch (this.Event) {
      case 'sys_approval_change':   // 审批申请状态变化
        info(`处理sys_approval_change事件消息`);
        this.ApprovalInfo = this.refineApprovalInfoFromXmlJson(this.ApprovalInfo[0]);
        break;
      case 'change_contact':      // 通讯录变更通知
        Object.assign(this, {
          ...this,
          ...refineContactFromXmlJson(this),
        });
        break;
      case 'template_card_event':
        Object.assign(this, {
          ...this,
          ...refineTemplateCardEventInfoFromXmlJson(this),
        });
        break;
    }
  }
  eventToText() {
    switch (this.Event) {
      case 'subscribe':
        return '关注'
      case 'unsubscribe':
        return '取消关注'
      case 'sys_approval_change':
        return '审批申请状态变化回调通知'
      case 'change_contact':
        return '通讯录回调通知';
      case 'click':
        return '点击菜单拉取消息的事件';
      case 'view':
        return '点击菜单跳转链接的事件';
      default:
        return `未定义(${this.Event})`
    }
  }
  /**
   * 处理ApprovalInfo消息
   * @param {Object} that 消息对象
   * @returns 
   * @see https://developer.work.weixin.qq.com/document/path/91815
   */
  refineApprovalInfoFromXmlJson(that) {
    debug(`开始解析ApprovalInfo::${JSON.stringify(that)}`)
    return {
      ...that,
      SpNo: that.SpNo[0],
      SpName: that.SpName[0],
      SpStatus: parseInt(that.SpStatus[0], 10),
      SpStatusText: this.spStatusToText(that.SpStatus),
      TemplateId: that.TemplateId[0],
      ApplyTime: parseInt(that.ApplyTime[0], 10),
      Applyer: {
        UserId: that.Applyer[0].UserId[0],
        Party: that.Applyer[0].Party[0],
      },
      SpRecord: {
        SpStatus: parseInt(that.SpRecord[0].SpStatus[0], 10),
        ApproverAttr: parseInt(that.SpRecord[0].ApproverAttr[0], 10),
        Details: {
          Approver: {
            UserId: that.SpRecord[0].Details[0].Approver[0].UserId[0],
          },
          Speech: that.SpRecord[0].Details[0].Speech[0],
          SpStatus: parseInt(that.SpRecord[0].Details[0].SpStatus[0], 10),
          SpTime: parseInt(that.SpRecord[0].Details[0].SpTime[0], 10),
        },
      },
      Notifyer: that.Notifyer ? this.refineUserInfo(that.Notifyer[0]) : undefined,
      StatuChangeEvent: parseInt(that.StatuChangeEvent[0], 10),
    }
  }

  /**
   * 用于解析形如:
   * <Applyer>
      <UserId><![CDATA[WuJunJie]]></UserId>
      <Party><![CDATA[1]]></Party>
    </Applyer>
   * 的XmlJson数据
   * @param {XmlJson} xmlJson 包含用户信息的Json数据
   * @returns 
   */
  refineUserInfo(xmlJson) {
    return {
      UserId: xmlJson.UserId[0],
      Party: xmlJson.Party ? xmlJson.Party[0] : undefined,
    }
  }

  spStatusToText(spStatus) {
    spStatus ??= this.ApprovalInfo?.SpStatus;
    spStatus = (spStatus instanceof Number) ? spStatus : parseInt(spStatus, 10);
    switch (spStatus) {
      case 1:
        return '审批中'
      case 2:
        return '已通过';
      case 3:
        return '已驳回';
      case 4:
        return '已撤销';
      case 6:
        return '通过后撤销';
      case 7:
        return '已删除';
      case 10:
        return '已支付';
      default:
        return '未知';
    }
  }
}

/**
 * 解析接收到的数据包
 * @param {String} xml XML数据
 */
export const parseMessage = async (xml, encoding_aes_key = ENCODING_AES_KEY) => {
  const parser = new xml2js.Parser();
  // 将消息体解析为JSON
  const result = await parser.parseStringPromise(xml);

  // 对加密的消息进行解密
  const { message } = decrypt(encoding_aes_key, result.xml.Encrypt[0]);
  debug(`待解析的消息:${JSON.stringify(message)}`);

  // 将消息块解析为JSON
  const messageJson = await parser.parseStringPromise(message);

  // 根据情况返回不同的对象
  switch (messageJson.xml.MsgType[0]) {
    case 'text':
      info('按文本消息进行解析');
      return new WecomTextMessage(messageJson.xml);
    case 'event':
      info('按事件消息进行解析');
      return new WecomEventMessage(messageJson.xml);
    case 'location':
    case 'link':
    case 'image':
    case 'voice':
    case 'video':
    default:
      info('按默认消息进行解析')
      return new WecomMessage(messageJson.xml);
  }
}

/**
 * 
 * @param {String} json User数据的Xml结构
 */
const refineContactFromXmlJson = (json) => {
  info(`当前事件(change_contact)的ChangeType为:${json.ChangeType[0]}`);
  let result = {
    ...json,
    ChangeType: json.ChangeType[0],
  }

  // 以下数据字段不一定出现，根据情况处理
  // 成员变更
  if (json.UserID) result.UserID = json.UserID[0];
  if (json.Name) result.Name = json.Name[0];
  if (json.Department) result.Department = json.Department[0].split(',');
  if (json.MainDepartment) result.MainDepartment = json.MainDepartment[0];
  if (json.IsLeader) result.IsLeader = parseInt(json.IsLeader[0],10);
  if (json.IsLeaderInDept) result.IsLeaderInDept = json.IsLeaderInDept[0].split(',').map(lid => parseInt(lid, 10));
  if (json.DirectLeader) result.DirectLeader = json.DirectLeader[0].split(',');
  if (json.Position) result.Position = json.Position[0];
  if (json.Mobile) result.Mobile = json.Mobile[0];
  if (json.Gender) result.Gender = parseInt(json.Gender[0], 10);
  if (json.Email) result.Email = json.Email[0];
  if (json.BizMail) result.BizMail = json.BizMail[0];
  if (json.Status) result.Status = json.Status[0];
  if (json.Avatar) result.Avatar = json.Avatar[0];
  if (json.Alias) result.Alias = json.Alias[0];
  if (json.Telephone) result.Telephone = json.Telephone[0];
  if (json.Address) result.Address = json.Address[0];
  if (json.ExtAttr) result.ExtAttr = json.ExtAttr[0].Item.map(item => {
    let res = {
      ...item,
      Name: item.Name[0],
      Type: parseInt(item.Type[0], 10),
    };
    if (item.Value) res.Value = item.Value[0];
    if (item.Text) res.Text = item.Text[0].Value[0];
    if (item.Web) res.Web = {
      Title: item.Web[0].Title,
      Url: item.Web[0].Url,
    };
    return res;
  });

  // 部门变更
  if (json.Id) result.Id = parseInt(json.Id[0], 10);
  if (json.ParentId) result.ParentId = parseInt(json.ParentId[0], 10);
  if (json.Order) result.Order = parseInt(json.Order[0], 10);

  // 标签变更
  if (json.TagId) result.TagId = parseInt(json.TagId[0], 10);
  if (json.AddUserItems) result.AddUserItems = json.AddUserItems[0].split(',');
  if (json.DelUserItems) result.DelUserItems = json.DelUserItems[0].split(',');
  if (json.AddPartyItems) result.AddPartyItems = json.AddPartyItems[0].split(',').map(lid => parseInt(lid, 10));
  if (json.DelPartyItems) result.DelPartyItems = json.DelPartyItems[0].split(',').map(lid => parseInt(lid, 10));
  
  return result;
}

const refineTemplateCardEventInfoFromXmlJson = (json) => {
  let result = {
    ...json,
    EventKey: json.EventKey[0],
    TaskId: json.TaskId[0],
    CardType: json.CardType[0],
    ResponseCode: json.ResponseCode[0],
    SelectedItems: json.SelectedItems[0].SelectedItem,
  }
  return result;
}

/**
 * 发送消息到企业微信
 * @param {Object} message 待发送的消息
 * @param {Object} options 参数
 *  - enable_duplicate_check 是否开启重复消息检查，0表示否，1表示是，默认0
 *  - enable_id_trans 表示是否开启id转译，0表示否，1表示是，默认0
 */
export const send = async (message, options = {}) => {

  // 表示是否开启重复消息检查，0表示否，1表示是，默认0
  const enable_duplicate_check = options.enable_duplicate_check || 0

  // 表示是否开启id转译，0表示否，1表示是，默认0
  const enable_id_trans = options.enable_id_trans || 0;

  // 表示是否重复消息检查的时间间隔，默认1800s，最大不超过4小时
  const duplicate_check_interval = options.duplicate_check_interval || 1800
  const token = await getToken(options);
  const res = await axios.post(`${qyHost}/message/send?access_token=${token}`, {
    ...message,
    enable_id_trans,
    enable_duplicate_check,
    duplicate_check_interval,
  });
  const result = res.data;
  if (result.errcode) {
    error(`发送消息失败:${result.errmsg}(${result.errcode})`);
  } else {
    info(`消息发送成功`);
  }
  return result;
};

/**
 * 发送文本消息
 * @param {Object} to 接收者
 * @param {Number|String} agentid 接收应用ID
 * @param {String} content 消息内容
 * @param {Object} options 参数
 *  - secret 用于发送消息的secret
 *  - safe 表示是否是保密消息，0表示可对外分享，1表示不能分享且内容显示水印，默认为0
 */
export const sendText = async (to, agentid, content, options = {}) => {
  const safe = options.safe || 0;
  const message = {
    ...to,
    agentid,
    msgtype: 'text',
    safe,
    text: { content },
  };
  return send(message, options);
};

export const sendTemplateCard = async (to, agentid, template_card, options = {}) => {
  const message = {
    ...to,
    msgtype: 'template_card',
    agentid,
    template_card,
  };
  return send(message, options);
}

export const sendTextCard = async (to, agentid, textcard, options = {}) => {
  const message = {
    ...to,
    msgtype: 'textcard',
    agentid,
    textcard,
  };
  return send(message, options);
}

/**
 * 发送Markdown消息
 * @param {Object} to 要接收消息的用户、部门及标签
 * @param {Number} agentid 发送消息的应用
 * @param {String} content 发送的内容
 * @param {Object} options 相关配置
 * @returns 发送结果
 */
export const sendMarkdown = async (to, agentid, content, options = {}) => {
  const message = {
    ...to,
    msgtype: 'markdown',
    agentid,
    markdown: {
      content,
    },
  };
  return send(message, options);
}
 
export default {
  parseMessage,
  send,
  sendText,
  sendTemplateCard,
  sendTextCard,
  sendMarkdown,
}