import { NextRequest, NextResponse } from "next/server";
import { EmailService } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emailConfig, recipientEmail } = body as {
      emailConfig?: {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        pass: string;
      };
      recipientEmail?: string;
    };

    if (!emailConfig || !recipientEmail) {
      return NextResponse.json(
        { error: "缺少邮件配置或收件人邮箱" },
        { status: 400 }
      );
    }

    if (!emailConfig.host || !emailConfig.port || !emailConfig.user || !emailConfig.pass) {
      return NextResponse.json(
        { error: "邮件配置不完整，请检查 SMTP 服务器、端口、账号和密码" },
        { status: 400 }
      );
    }

    const emailService = new EmailService(emailConfig);
    const isConnected = await emailService.verifyConnection();
    if (!isConnected) {
      return NextResponse.json(
        { error: "无法连接到邮件服务器，请检查 SMTP 配置" },
        { status: 500 }
      );
    }

    await emailService.sendEmail({
      to: recipientEmail,
      subject: "【Torn Stocks Quant】测试邮件",
      text: "这是一封来自 Torn Stocks Quant 的测试邮件。\n\n如果您收到这封邮件，说明邮件配置正确，信号提醒功能已准备就绪。",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#3b82f6;">Torn Stocks Quant</h2>
          <p>这是一封测试邮件。如果您收到这封邮件，说明邮件配置正确，信号提醒功能已准备就绪。</p>
          <p style="color:#999;font-size:12px;">此邮件由系统自动发送，请勿回复。</p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "测试邮件发送成功",
    });
  } catch (error) {
    console.error("发送测试邮件失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发送测试邮件失败" },
      { status: 500 }
    );
  }
}
