# -*- coding: utf-8 -*-
import argparse
import os

print("Loading export dependencies", flush=True)
import torch
print("Loaded torch", flush=True)
from transformers import CLIPModel, Dinov2Model
print("Loaded transformers", flush=True)


CLIP_MODEL_ID = "laion/CLIP-ViT-B-32-laion2B-s34B-b79K"
CLIP_REVISION = "1a25a446712ba5ee05982a381eed697ef9b435cf"
DINO_MODEL_ID = "facebook/dinov2-small"
DINO_REVISION = "ed25f3a31f01632728cabb09d1542f84ab7b0056"


class ClipImageEncoder(torch.nn.Module):
    def __init__(self):
        super().__init__()
        print("Loading CLIP model", flush=True)
        self.model = CLIPModel.from_pretrained(
            CLIP_MODEL_ID,
            revision=CLIP_REVISION,
            attn_implementation="eager",
        )

    def forward(self, pixel_values):
        return self.model.get_image_features(pixel_values=pixel_values)


class DinoImageEncoder(torch.nn.Module):
    def __init__(self):
        super().__init__()
        print("Loading DINOv2 model", flush=True)
        self.model = Dinov2Model.from_pretrained(
            DINO_MODEL_ID,
            revision=DINO_REVISION,
            attn_implementation="eager",
        )

    def forward(self, pixel_values):
        return self.model(pixel_values=pixel_values).last_hidden_state


def export_model(model, output_path, output_name):
    print("Exporting " + output_path, flush=True)
    model.eval()
    dummy = torch.zeros((1, 3, 224, 224), dtype=torch.float32)
    with torch.inference_mode():
        torch.onnx.export(
            model,
            (dummy,),
            output_path,
            input_names=["pixel_values"],
            output_names=[output_name],
            dynamic_axes={"pixel_values": {0: "batch"}, output_name: {0: "batch"}},
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
        )
    print("Finished " + output_path, flush=True)


def main():
    torch.set_num_threads(1)
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    export_model(
        ClipImageEncoder(),
        os.path.join(args.output_dir, "clip-image-encoder.onnx"),
        "image_embeds",
    )
    export_model(
        DinoImageEncoder(),
        os.path.join(args.output_dir, "dinov2-image-encoder.onnx"),
        "last_hidden_state",
    )


if __name__ == "__main__":
    main()
